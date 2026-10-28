/**
 * Corrección asistida de los hallazgos de la revisión de una plantilla:
 *   1. El usuario elige los hallazgos que quiere arreglar.
 *   2. La IA propone, para cada uno, un cambio de texto (fragmento literal → fragmento corregido),
 *      o explica por qué no se arregla automáticamente (cláusulas nuevas, formato, criterio del notario).
 *   3. El usuario elige qué cambios aplicar. Se crea una NUEVA versión pendiente de aprobación:
 *      la versión revisada no se modifica y el notario sigue aprobando antes de que se use.
 * Cada cambio se valida antes de proponerlo y otra vez al aplicarlo: el fragmento debe estar una
 * sola vez en la plantilla, las etiquetas deben quedar bien formadas y solo se usan variables conocidas.
 */
import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { vistaPreviaDocx, textoDeParrafos, etiquetasDe } from '../escritura/vista-previa';
import { reemplazarEnDocx, type ResultadoReemplazo } from '../escritura/editar-docx';
import { llamarEstructurado, ErrorIA } from '../ia/cliente';
import { SISTEMA_CORRECCION_PLANTILLA, ESQUEMA_CORRECCION_PLANTILLA } from '../ia/instrucciones';
import { validarDocxPlantilla, cargarPlantilla, ErrorPlantilla } from './plantillas';
import { revisarPlantilla, type RevisionPlantilla, type CorreccionPlantilla, type PropuestaPlantilla } from './revision-plantillas';
import { TIPOS_CON_FORMULARIO_PROPIO } from '../escritura/esquemas';
import { VARIABLES_AUTOMATICAS } from '../escritura/actos-plantilla';

/** Una corrección EN_CURSO más antigua que esto se da por interrumpida (p. ej., el servidor se reinició) */
const LIMITE_CORRECCION_MS = 30 * 60 * 1000;
const LIMITE_TEXTO = 80_000;

const MOTIVOS: Record<Exclude<ResultadoReemplazo, 'APLICADO'>, string> = {
  NO_ENCONTRADO: 'el texto que la IA citó no está tal cual en la plantilla',
  AMBIGUO: 'el texto que la IA citó aparece varias veces en la plantilla',
  CRUZA_FORMATO: 'el cambio cruza una tabulación, un salto de línea o un párrafo',
};
const motivo = (r: ResultadoReemplazo | { rechazado: string }) => (typeof r === 'string' ? MOTIVOS[r as keyof typeof MOTIVOS] : r.rechazado);

/** Nombre base de una etiqueta: "#a.es_cuota" → "a.es_cuota"; "a.vendedor | g:'señor'" → "a.vendedor" */
const baseEtiqueta = (etiqueta: string) => etiqueta.replace(/^[#^/]\s*/, '').split('|')[0].trim().replace(/\s+/g, ' ');
const etiquetasEn = (texto: string) => [...texto.matchAll(/\{\{\s*([\s\S]*?)\s*\}\}/g)].map((m) => baseEtiqueta(m[1]));

/** Etiquetas que la IA puede usar: las de esta versión y las de la versión aprobada del mismo tipo */
async function etiquetasConocidas(tipoId: string, archivo: Buffer): Promise<string[]> {
  const aprobada = await db.plantilla.findFirst({ where: { tipoId, estado: 'APROBADA' }, orderBy: { version: 'desc' } });
  const conjunto = new Set<string>(['ord()']);
  for (const doc of [archivo, ...(aprobada ? [Buffer.from(aprobada.archivo)] : [])]) {
    const e = etiquetasDe(vistaPreviaDocx(doc));
    for (const x of [...e.variables, ...e.condiciones]) conjunto.add(baseEtiqueta(x));
  }
  return [...conjunto].sort();
}

/**
 * Valida el documento después de un cambio: etiquetas bien formadas y solo variables conocidas. Con
 * formulario automático se aceptan variables nuevas (cada una será un campo), con nombre válido.
 */
function validador(conocidas: string[], automatico: boolean) {
  return (doc: Buffer): string | null => {
    const v = validarDocxPlantilla(doc);
    if (!v.ok) return `dejaría la plantilla con etiquetas mal formadas (${v.error})`;
    const nuevas = etiquetasEn(textoDeParrafos(vistaPreviaDocx(doc))).filter((e) => !conocidas.includes(e) && !(automatico && /^[a-z0-9_]+$/.test(e)));
    return nuevas.length ? `usa variables que el sistema no conoce: ${[...new Set(nuevas)].map((e) => `{{${e}}}`).join(', ')}` : null;
  };
}

async function guardarCorreccion(id: string, revisadaEn: Date | null, correccion: CorreccionPlantilla) {
  // Si la plantilla se revisó de nuevo mientras tanto, los hallazgos cambiaron: el resultado se descarta
  const actual = await db.plantilla.findUniqueOrThrow({ where: { id } });
  if (actual.revisadaEn?.getTime() !== revisadaEn?.getTime() || !actual.revision) return false;
  await db.plantilla.update({ where: { id }, data: { revision: { ...(actual.revision as object), correccion } as unknown as Prisma.InputJsonValue } });
  return true;
}

/** Estado de la corrección; marca como interrumpida la que lleva demasiado tiempo en curso */
export async function estadoCorreccionPlantilla(id: string): Promise<CorreccionPlantilla | null> {
  const p = await db.plantilla.findUniqueOrThrow({ where: { id } });
  const c = (p.revision as RevisionPlantilla | null)?.correccion ?? null;
  if (c?.estado === 'EN_CURSO' && Date.now() - new Date(c.iniciadaEn).getTime() > LIMITE_CORRECCION_MS) {
    const interrumpida: CorreccionPlantilla = { ...c, estado: 'ERROR', error: 'La propuesta se interrumpió antes de terminar. Pídala de nuevo.' };
    await guardarCorreccion(id, p.revisadaEn, interrumpida);
    return interrumpida;
  }
  return c;
}

/**
 * Valida la petición y deja la corrección EN_CURSO. Devuelve `tarea`, que la acción programa
 * para después de responder (la IA puede tardar minutos): la página muestra el avance.
 */
export async function proponerCorreccionesPlantilla(s: SesionActiva, id: string, hallazgos: number[]) {
  const p = await db.plantilla.findUniqueOrThrow({ where: { id }, include: { tipo: true } });
  const revision = p.revision as RevisionPlantilla | null;
  if (p.estado === 'RETIRADA') throw new ErrorPlantilla('Esta versión está retirada: corrija la versión vigente o una pendiente.');
  if (!revision?.ia) throw new ErrorPlantilla('Primero revise la plantilla con la IA.');
  if ((await estadoCorreccionPlantilla(id))?.estado === 'EN_CURSO') throw new ErrorPlantilla('La IA ya está preparando correcciones para esta versión. Espere a que termine.');
  const elegidos = [...new Set(hallazgos)].filter((i) => Number.isInteger(i) && i >= 0 && i < revision.ia!.hallazgos.length);
  if (!elegidos.length) throw new ErrorPlantilla('Seleccione al menos un hallazgo.');

  const base: CorreccionPlantilla = { estado: 'EN_CURSO', iniciadaEn: new Date().toISOString(), hallazgos: elegidos, propuestas: [], sinCorreccion: [] };
  await guardarCorreccion(id, p.revisadaEn, base);
  const archivo = Buffer.from(p.archivo);

  const tarea = async () => {
    let correccion: CorreccionPlantilla;
    try {
      // Con formulario automático la IA puede crear variables (cada una será un campo) y conoce las del sistema
      const automatico = !p.tipo.esBloque && !TIPOS_CON_FORMULARIO_PROPIO.has(p.tipoId);
      const conocidas = [...new Set([...(await etiquetasConocidas(p.tipoId, archivo)), ...(automatico ? VARIABLES_AUTOMATICAS : [])])].sort();
      const texto = textoDeParrafos(vistaPreviaDocx(archivo));
      const lista = elegidos.map((i) => ({ hallazgo: i, ...revision.ia!.hallazgos[i] }));
      const r = await llamarEstructurado<{ correcciones: { hallazgo: number; original: string; corregido: string; explicacion: string }[]; sin_correccion: { hallazgo: number; motivo: string }[] }>({
        proposito: 'PLANTILLA',
        sistema: SISTEMA_CORRECCION_PLANTILLA,
        contenido: [{ type: 'text', text: [
          `TIPO: ${p.tipo.nombre} (${p.tipoId}) · versión ${p.version}`,
          automatico
            ? `FORMULARIO AUTOMÁTICO: puede crear variables y condiciones nuevas. Variables del sistema (notaría y terminación): ${VARIABLES_AUTOMATICAS.map((e) => `{{${e}}}`).join(', ')}. Etiquetas que ya usa: ${conocidas.filter((e) => !VARIABLES_AUTOMATICAS.includes(e)).map((e) => `{{${e}}}`).join(', ') || 'ninguna'}`
            : `ETIQUETAS CONOCIDAS (las únicas que puede usar): ${conocidas.map((e) => `{{${e}}}`).join(', ') || 'ninguna'}`,
          `HALLAZGOS A CORREGIR:\n${JSON.stringify(lista)}`,
          `<plantilla>\n${texto.slice(0, LIMITE_TEXTO)}\n</plantilla>`,
          'Propón las correcciones de los hallazgos recibidos.',
        ].join('\n\n') }],
        esquema: ESQUEMA_CORRECCION_PLANTILLA as unknown as Record<string, unknown>,
        maxTokens: 16000,
      });

      // Cada propuesta se prueba sola sobre la versión actual: solo quedan las que se pueden aplicar
      const aceptar = validador(conocidas, automatico);
      const propuestas: PropuestaPlantilla[] = [];
      const sinCorreccion: CorreccionPlantilla['sinCorreccion'] = [];
      for (const c of r.datos.correcciones) {
        if (!elegidos.includes(c.hallazgo) || c.original === c.corregido) continue;
        const prueba = reemplazarEnDocx(archivo, [{ original: c.original, nuevo: c.corregido }], aceptar).resultados[0];
        if (prueba === 'APLICADO') propuestas.push({ hallazgo: c.hallazgo, original: c.original.slice(0, 4000), corregido: c.corregido.slice(0, 4000), explicacion: c.explicacion.slice(0, 1000), estado: 'PENDIENTE' });
        else sinCorreccion.push({ hallazgo: c.hallazgo, motivo: `No se puede aplicar automáticamente: ${motivo(prueba)}. Corríjalo en Word. (Cambio propuesto: «${c.original.slice(0, 200)}» → «${c.corregido.slice(0, 200)}»)` });
      }
      for (const x of r.datos.sin_correccion) {
        if (elegidos.includes(x.hallazgo) && !propuestas.some((c) => c.hallazgo === x.hallazgo)) sinCorreccion.push({ hallazgo: x.hallazgo, motivo: x.motivo.slice(0, 1000) });
      }
      for (const i of elegidos) {
        if (!propuestas.some((c) => c.hallazgo === i) && !sinCorreccion.some((x) => x.hallazgo === i)) sinCorreccion.push({ hallazgo: i, motivo: 'La IA no propuso un cambio para este hallazgo. Corríjalo en Word si corresponde.' });
      }
      correccion = { ...base, estado: 'COMPLETADA', propuestas, sinCorreccion };
      await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_CORRECCION_PROPUESTA', entidad: 'plantilla', entidadId: id, detalle: { tipoId: p.tipoId, version: p.version, hallazgos: elegidos.length, propuestas: propuestas.length, sinCorreccion: sinCorreccion.length, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida } });
    } catch (e) {
      if (!(e instanceof ErrorIA)) console.error('[correccion-plantillas]', e);
      correccion = { ...base, estado: 'ERROR', error: e instanceof ErrorIA ? e.message : 'Error inesperado al pedir las correcciones a la IA.' };
    }
    await guardarCorreccion(id, p.revisadaEn, correccion).catch((e) => console.error('[correccion-plantillas]', e));
  };
  return { hallazgos: elegidos.length, tarea };
}

/**
 * Aplica las propuestas elegidas (por índice) en una nueva versión pendiente de aprobación,
 * que queda con la verificación automática hecha. Sin índices, descarta la propuesta.
 */
export async function aplicarCorreccionesPlantilla(s: SesionActiva, id: string, indices: number[]): Promise<{ nuevaId: string | null; aplicadas: number; fallidas: string[] }> {
  const p = await db.plantilla.findUniqueOrThrow({ where: { id }, include: { tipo: true } });
  const revision = p.revision as RevisionPlantilla | null;
  const c = revision?.correccion;
  if (!revision || c?.estado !== 'COMPLETADA') throw new ErrorPlantilla('La propuesta de corrección ya no existe.');

  const elegidas = c.propuestas.map((x, i) => ({ x, i })).filter(({ x, i }) => x.estado === 'PENDIENTE' && indices.includes(i));
  const archivo = Buffer.from(p.archivo);
  const r = elegidas.length
    ? reemplazarEnDocx(archivo, elegidas.map(({ x }) => ({ original: x.original, nuevo: x.corregido })), validador([...(await etiquetasConocidas(p.tipoId, archivo)), ...VARIABLES_AUTOMATICAS], !p.tipo.esBloque && !TIPOS_CON_FORMULARIO_PROPIO.has(p.tipoId)))
    : null;
  const fallidas: string[] = [];
  c.propuestas.forEach((x, i) => {
    const k = elegidas.findIndex((e) => e.i === i);
    if (k < 0) { if (x.estado === 'PENDIENTE') x.estado = 'DESCARTADA'; return; }
    const res = r!.resultados[k];
    x.estado = res === 'APLICADO' ? 'APLICADA' : 'DESCARTADA';
    // Dos cambios sobre el mismo texto: el segundo ya no encuentra su fragmento
    if (res !== 'APLICADO') fallidas.push(`«${x.original.slice(0, 80)}»: ${motivo(res)}`);
  });
  const aplicadas = c.propuestas.filter((x) => x.estado === 'APLICADA');

  let nuevaId: string | null = null;
  if (aplicadas.length && r) {
    const hallazgos = revision.ia?.hallazgos ?? [];
    const notas = [`Correcciones de la IA sobre la versión ${p.version}, elegidas por ${s.usuario.nombre}:`,
      ...aplicadas.map((x) => `- ${hallazgos[x.hallazgo]?.mensaje ?? 'Hallazgo'} → «${x.original.slice(0, 150)}» por «${x.corregido.slice(0, 150)}»`),
      ...(fallidas.length ? ['No se pudieron aplicar (corríjalos en Word):', ...fallidas.map((f) => `- ${f}`)] : [])].join('\n');
    // La conversión del caso real (y sus valores ficticios para la vista de ejemplo) pasa a la nueva versión
    const nueva = await cargarPlantilla(p.tipoId, p.nombreArchivo, r.docx, s.usuario.id, notas.slice(0, 4000), (p.variabilizacion ?? undefined) as Prisma.InputJsonValue | undefined);
    nuevaId = nueva.id;
    await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_CARGADA', entidad: 'plantilla', entidadId: nueva.id, detalle: { tipoId: p.tipoId, version: nueva.version, sha256: nueva.hashSha256, origen: 'correccion_ia', desde: p.version } });
  }
  await guardarCorreccion(id, p.revisadaEn, { ...c, ...(nuevaId ? { nuevaVersionId: nuevaId } : {}), sinCorreccion: [] });
  await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_CORRECCION_APLICADA', entidad: 'plantilla', entidadId: id, detalle: { tipoId: p.tipoId, version: p.version, aplicadas: aplicadas.length, fallidas: fallidas.length, nuevaVersionId: nuevaId } });
  // La nueva versión queda con la verificación automática; la revisión de la IA se pide desde su página
  if (nuevaId) await revisarPlantilla(nuevaId, s, false).catch((e) => console.error('[correccion-plantillas] verificación', e));
  return { nuevaId, aplicadas: aplicadas.length, fallidas };
}
