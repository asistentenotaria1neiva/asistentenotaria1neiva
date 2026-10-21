/**
 * Revisión de plantillas antes de la aprobación del notario:
 *   1. Verificación automática: variables y condiciones que usa, cuáles son nuevas o ya no
 *      aparecen frente a la versión aprobada, y una prueba de llenado con datos FICTICIOS
 *      (datos_prueba/casos.json) que muestra las variables que el sistema no sabe llenar.
 *   2. Revisión de la IA: redacción, datos fijos de un caso real, partes del acto y cambios.
 * El resultado se guarda en la versión (plantillas.revision). La IA solo advierte: la
 * aprobación sigue siendo del administrador por indicación del notario.
 */
import 'server-only';
import type { Plantilla, Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { obtenerConfig } from '../configuracion';
import { prepararContexto } from '../escritura/contexto';
import { ACTOS } from '../escritura/actos';
import { renderizarPlantilla } from '../escritura/generar';
import { ErrorDatos } from '../escritura/personas';
import type { DatosExpediente } from '../escritura/tipos';
import { vistaPreviaDocx, textoDeParrafos, etiquetasDe, type Parrafo, type EtiquetasPlantilla } from '../escritura/vista-previa';
import { llamarEstructurado, ErrorIA } from '../ia/cliente';
import { SISTEMA_REVISION_PLANTILLA, ESQUEMA_REVISION_PLANTILLA } from '../ia/instrucciones';
import casosEjemplo from '../../../datos_prueba/casos.json';

interface CasoEjemplo { clave: string; descripcion: string; actos: string[]; datos: DatosExpediente }
const CASOS = (casosEjemplo as unknown as { casos: CasoEjemplo[] }).casos;

export type NivelHallazgo = 'CRITICA' | 'ADVERTENCIA' | 'INFORMATIVA';
export type Veredicto = 'APTA' | 'APTA_CON_OBSERVACIONES' | 'NO_APTA';

export interface HallazgoPlantilla {
  nivel: NivelHallazgo;
  categoria: 'VARIABLES' | 'DATO_FIJO' | 'REDACCION' | 'CONTENIDO' | 'CAMBIO' | 'FORMATO';
  mensaje: string;
  fragmento: string | null;
}

export interface VerificacionAutomatica {
  etiquetas: EtiquetasPlantilla;
  comparadaCon: number | null; // versión aprobada contra la que se compararon las variables
  nuevas: string[];
  eliminadas: string[];
  prueba: { caso: string; descripcion: string; faltantes: string[]; error?: string } | null;
}

export interface RevisionPlantilla {
  automatica: VerificacionAutomatica;
  ia: { veredicto: Veredicto; resumen: string; cambios: string[]; hallazgos: HallazgoPlantilla[]; modelo: string; duracionMs: number } | null;
  errorIA: string | null;
  revisadaPor: string;
}

const LIMITE_TEXTO = 80_000; // caracteres por texto enviado a la IA

function mensajeError(e: unknown): string {
  const detalle = (e as { properties?: { errors?: { properties?: { explanation?: string } }[] } }).properties?.errors
    ?.map((x) => x.properties?.explanation).filter(Boolean).join('; ');
  return detalle || (e instanceof Error ? e.message : String(e));
}

/** Caso de datos ficticios que ejercita este tipo de plantilla (carátula y cierre van en todos) */
function casoPara(tipoId: string): CasoEjemplo | undefined {
  if (tipoId === 'caratula' || tipoId === 'cierre') return CASOS[0];
  return CASOS.find((c) => c.actos.includes(tipoId) || c.actos.some((a) => ACTOS[a]?.anexo === tipoId));
}

export type PruebaEjemplo =
  | { caso: CasoEjemplo; parrafos: Parrafo[]; faltantes: string[] }
  | { caso: CasoEjemplo; error: string };

/** Llena la plantilla con un caso ficticio. null si aún no hay caso de ejemplo para el tipo. */
export async function probarConEjemplo(tipoId: string, archivo: Buffer): Promise<PruebaEjemplo | null> {
  const caso = casoPara(tipoId);
  if (!caso) return null;
  try {
    const ctx = prepararContexto(caso.datos, caso.actos, await obtenerConfig('notaria'));
    const contexto = ctx.actos.find((a) => a.plantilla === tipoId)?.contexto ?? ctx.global;
    const r = renderizarPlantilla(archivo, contexto);
    return { caso, parrafos: vistaPreviaDocx(r.docx, { marcarFaltantes: true }), faltantes: r.faltantes };
  } catch (e) {
    if (e instanceof ErrorDatos) return { caso, error: `El caso de ejemplo no tiene: ${e.faltantes.join(', ')}` };
    return { caso, error: `La plantilla no se pudo llenar: ${mensajeError(e)}` };
  }
}

async function verificar(p: Pick<Plantilla, 'id' | 'tipoId' | 'archivo'>) {
  const parrafos = vistaPreviaDocx(Buffer.from(p.archivo));
  const etiquetas = etiquetasDe(parrafos);
  const aprobada = await db.plantilla.findFirst({ where: { tipoId: p.tipoId, estado: 'APROBADA', id: { not: p.id } }, orderBy: { version: 'desc' } });
  const parrafosAprobada = aprobada ? vistaPreviaDocx(Buffer.from(aprobada.archivo)) : null;
  const todas = (e: EtiquetasPlantilla) => [...e.variables, ...e.condiciones];
  const previas = parrafosAprobada ? todas(etiquetasDe(parrafosAprobada)) : null;
  const prueba = await probarConEjemplo(p.tipoId, Buffer.from(p.archivo));
  const automatica: VerificacionAutomatica = {
    etiquetas,
    comparadaCon: aprobada?.version ?? null,
    nuevas: previas ? todas(etiquetas).filter((x) => !previas.includes(x)) : [],
    eliminadas: previas ? previas.filter((x) => !todas(etiquetas).includes(x)) : [],
    prueba: prueba && ('error' in prueba
      ? { caso: prueba.caso.clave, descripcion: prueba.caso.descripcion, faltantes: [], error: prueba.error }
      : { caso: prueba.caso.clave, descripcion: prueba.caso.descripcion, faltantes: prueba.faltantes }),
  };
  return {
    automatica,
    texto: textoDeParrafos(parrafos),
    textoAprobada: parrafosAprobada ? textoDeParrafos(parrafosAprobada) : null,
    textoEjemplo: prueba && 'parrafos' in prueba ? textoDeParrafos(prueba.parrafos) : null,
  };
}

function solicitud(p: Pick<Plantilla, 'version' | 'nombreArchivo' | 'notas'> & { tipo: { id: string; nombre: string; categoria: string; esBloque: boolean; descripcion: string | null; normas: string | null } }, v: Awaited<ReturnType<typeof verificar>>): string {
  const a = v.automatica;
  const lista = (xs: string[]) => (xs.length ? xs.map((x) => `{{${x}}}`).join(', ') : 'ninguna');
  return [
    `TIPO: ${p.tipo.nombre} (${p.tipo.id}) · ${p.tipo.esBloque ? 'bloque común de todas las escrituras' : p.tipo.categoria}`,
    p.tipo.descripcion && `Descripción: ${p.tipo.descripcion}`,
    p.tipo.normas && `Referencia normativa registrada (pendiente de validar por el notario): ${p.tipo.normas}`,
    `VERSIÓN EN REVISIÓN: ${p.version} (archivo ${p.nombreArchivo})`,
    p.notas && `Notas de quien la cargó: ${p.notas}`,
    '',
    'VERIFICACIÓN AUTOMÁTICA:',
    a.comparadaCon
      ? `- Frente a la versión aprobada ${a.comparadaCon}: etiquetas nuevas ${lista(a.nuevas)}; etiquetas que ya no aparecen ${lista(a.eliminadas)}.`
      : '- No hay versión aprobada con la cual comparar.',
    a.prueba
      ? a.prueba.error
        ? `- Prueba con datos ficticios (${a.prueba.descripcion}): ${a.prueba.error}`
        : `- Prueba con datos ficticios (${a.prueba.descripcion}): variables que el sistema no supo llenar: ${lista(a.prueba.faltantes)}.`
      : '- No hay caso de datos ficticios para este tipo: no se pudo probar el llenado.',
    '',
    `<plantilla_en_revision>\n${v.texto.slice(0, LIMITE_TEXTO)}\n</plantilla_en_revision>`,
    v.textoAprobada && `<plantilla_aprobada_vigente version="${a.comparadaCon}">\n${v.textoAprobada.slice(0, LIMITE_TEXTO)}\n</plantilla_aprobada_vigente>`,
    v.textoEjemplo && `<borrador_de_ejemplo datos="ficticios">\n${v.textoEjemplo.slice(0, LIMITE_TEXTO)}\n</borrador_de_ejemplo>`,
  ].filter((x): x is string => typeof x === 'string').join('\n');
}

/** Verifica la versión y, si conIA, la hace revisar por la IA. Guarda y audita el resultado. */
export async function revisarPlantilla(id: string, s: SesionActiva, conIA = true): Promise<RevisionPlantilla> {
  const p = await db.plantilla.findUniqueOrThrow({ where: { id }, include: { tipo: true } });
  const v = await verificar(p);
  let ia: RevisionPlantilla['ia'] = null;
  let errorIA: string | null = null;
  if (conIA) {
    try {
      const r = await llamarEstructurado<Omit<NonNullable<RevisionPlantilla['ia']>, 'modelo' | 'duracionMs'>>({
        proposito: 'REVISION',
        sistema: SISTEMA_REVISION_PLANTILLA,
        contenido: [{ type: 'text', text: solicitud(p, v) }],
        esquema: ESQUEMA_REVISION_PLANTILLA as unknown as Record<string, unknown>,
        maxTokens: 16000,
      });
      ia = { ...r.datos, modelo: r.modelo, duracionMs: r.duracionMs };
    } catch (e) {
      if (!(e instanceof ErrorIA)) console.error('[revision-plantillas]', e);
      errorIA = e instanceof ErrorIA ? e.message : 'No se pudo completar la revisión de la IA.';
    }
  }
  const revision: RevisionPlantilla = { automatica: v.automatica, ia, errorIA, revisadaPor: s.usuario.nombre };
  await db.plantilla.update({ where: { id }, data: { revision: revision as unknown as Prisma.InputJsonValue, revisadaEn: new Date() } });
  await auditar({
    ...datosAuditoria(s), accion: 'PLANTILLA_REVISADA', entidad: 'plantilla', entidadId: id,
    detalle: { tipoId: p.tipoId, version: p.version, veredicto: ia?.veredicto ?? null, hallazgos: ia?.hallazgos.length ?? null, errorIA },
  });
  return revision;
}
