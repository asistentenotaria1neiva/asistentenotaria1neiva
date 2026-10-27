/**
 * Revisión de plantillas antes de la aprobación del notario:
 *   1. Verificación automática: variables y condiciones que usa, cuáles son nuevas o ya no
 *      aparecen frente a la versión aprobada, y una prueba de llenado con datos FICTICIOS
 *      (datos_prueba/casos.json) que muestra las variables que el sistema no sabe llenar.
 *      Si la versión viene de convertir un caso real, también se prueba con los valores ficticios
 *      que propuso la IA en la conversión (src/lib/servicios/variabilizar-plantilla.ts).
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
import type { Variabilizacion } from './variabilizar-plantilla';
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
  /** deMuestra: variables que el caso de ejemplo no trae y se llenaron con un valor genérico de muestra */
  prueba: { caso: string; descripcion: string; faltantes: string[]; deMuestra?: string[]; error?: string } | null;
}

export interface RevisionPlantilla {
  automatica: VerificacionAutomatica;
  ia: { veredicto: Veredicto; resumen: string; cambios: string[]; hallazgos: HallazgoPlantilla[]; modelo: string; duracionMs: number } | null;
  errorIA: string | null;
  revisadaPor: string;
  /** Corrección con IA de los hallazgos (src/lib/servicios/correccion-plantillas.ts) */
  correccion?: CorreccionPlantilla;
}

export interface PropuestaPlantilla {
  hallazgo: number; // índice en ia.hallazgos
  original: string;
  corregido: string;
  explicacion: string;
  estado: 'PENDIENTE' | 'APLICADA' | 'DESCARTADA';
}

export interface CorreccionPlantilla {
  estado: 'EN_CURSO' | 'COMPLETADA' | 'ERROR';
  iniciadaEn: string;
  hallazgos: number[];
  propuestas: PropuestaPlantilla[];
  sinCorreccion: { hallazgo: number; motivo: string }[];
  error?: string;
  /** Versión creada al aplicar las propuestas */
  nuevaVersionId?: string;
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

/** Valores ficticios que propuso la IA al convertir un caso real en plantilla (variable → valor) */
export type ValoresEjemplo = Record<string, string> | null | undefined;

const CASO_CONVERSION = { clave: 'conversion_ia', descripcion: 'valores ficticios que propuso la IA al convertir el caso real en plantilla' };

/** Hay datos ficticios para probar este tipo de plantilla: un caso de ejemplo o los valores de la conversión */
export const tieneEjemplo = (tipoId: string, valores?: ValoresEjemplo) => !!casoPara(tipoId) || !!(valores && Object.keys(valores).length);

/** Contexto del caso de ejemplo de este tipo (null si no hay); también orienta la conversión de casos reales */
export async function contextoEjemplo(tipoId: string): Promise<Record<string, unknown> | null> {
  const caso = casoPara(tipoId);
  if (!caso) return null;
  const ctx = prepararContexto(caso.datos, caso.actos, await obtenerConfig('notaria'));
  return ctx.actos.find((a) => a.plantilla === tipoId)?.contexto ?? ctx.global;
}

/** Agrega al contexto los valores de la conversión que el caso no trae, sin modificar los objetos originales */
function completarContexto(contexto: Record<string, unknown>, valores: Record<string, string>): Record<string, unknown> {
  const poner = (obj: Record<string, unknown>, ruta: string[], valor: string): Record<string, unknown> => {
    const [k, ...resto] = ruta;
    const actual = obj[k];
    if (!resto.length) return actual === undefined || actual === null ? { ...obj, [k]: valor } : obj;
    if (actual !== undefined && actual !== null && (typeof actual !== 'object' || Array.isArray(actual))) return obj;
    return { ...obj, [k]: poner((actual ?? {}) as Record<string, unknown>, resto, valor) };
  };
  return Object.entries(valores).reduce((ctx, [ruta, valor]) => poner(ctx, ruta.split('.'), valor), contexto);
}

export type PruebaEjemplo =
  | { caso: { clave: string; descripcion: string }; docx: Buffer; parrafos: Parrafo[]; faltantes: string[]; deMuestra: string[] }
  | { caso: { clave: string; descripcion: string }; error: string };

/** Nombre base de una etiqueta: "a.vendedores | El:'vendedor'" → "a.vendedores" */
const base = (etiqueta: string) => etiqueta.split('|')[0].trim();

/** Valor genérico de muestra según el nombre de la variable, para que la vista con datos de ejemplo quede completa */
export function valorDeMuestra(ruta: string): string {
  const n = (ruta.split('.').pop() ?? ruta).toLowerCase();
  const reglas: [RegExp, string][] = [
    [/estado_civil/, 'SOLTERO(A) SIN UNIÓN MARITAL DE HECHO'],
    [/cedula_catastral|codigo_catastral|ficha_catastral/, '01-02-0003-0004-000'],
    [/matricula/, '200-000000'],
    [/correo|email/, 'ejemplo@correo.com'],
    [/telefono|celular/, '300 000 0000'],
    [/documento|cedula|identificacion|^nit|_nit/, '1.234.567.890'],
    [/lugar_expedicion|expedida/, 'Neiva (Huila)'],
    [/fecha.*letras|letras.*fecha/, 'quince (15) de marzo de dos mil veinte (2020)'],
    [/fecha/, '15 de marzo de 2020'],
    [/anio.*letras/, 'dos mil veinte'],
    [/anio/, '2020'],
    [/dia.*letras/, 'quince'],
    [/^dia|_dia/, '15'],
    [/mes/, 'marzo'],
    [/numero.*letras|letras.*numero/, 'mil doscientos treinta y cuatro'],
    [/numero|^no_|radicado/, '1234'],
    [/modo_adquisicion|titulo_adquisicion/, 'compraventa'],
    [/notaria/, 'Notaría Segunda del Círculo de Ejemplo'],
    [/juzgado/, 'Juzgado Primero Civil Municipal de Ejemplo'],
    [/letras/, 'CIEN MILLONES DE PESOS'],
    [/valor|precio|avaluo|cuantia|derechos|monto|saldo|cuota|tarifa/, '$100.000.000'],
    [/area/, '100,00 m²'],
    [/coeficiente|porcentaje/, '1,25 %'],
    [/lindero/, 'Por el norte, con predio de ejemplo; por el sur, con vía pública de ejemplo.'],
    [/direccion/, 'Calle 1 # 2-34'],
    [/municipio|ciudad|domicilio/, 'Neiva'],
    [/departamento/, 'Huila'],
    [/actividad|ocupacion|profesion/, 'empleado(a)'],
    [/nombre|propietario|conyuge|companer|tradente|vendedor|comprador|apoderado|otorgante|deudor|acreedor|notario/, 'PERSONA DE EJEMPLO'],
  ];
  return reglas.find(([r]) => r.test(n))?.[1] ?? `${n.replace(/_/g, ' ')} de ejemplo`;
}

/**
 * Llena la plantilla con datos ficticios. null si no hay caso de ejemplo ni valores de la conversión.
 * Las variables que el caso no trae se llenan con un valor genérico de muestra (deMuestra), así la
 * vista queda completa; en faltantes solo quedan las que ni así se pudieron llenar.
 */
export async function probarConEjemplo(tipoId: string, archivo: Buffer, valores?: ValoresEjemplo): Promise<PruebaEjemplo | null> {
  if (!tieneEjemplo(tipoId, valores)) return null;
  const caso = casoPara(tipoId);
  const info = caso ? { clave: caso.clave, descripcion: caso.descripcion } : CASO_CONVERSION;
  try {
    let contexto = (await contextoEjemplo(tipoId)) ?? {};
    if (valores) contexto = completarContexto(contexto, valores);
    let r = renderizarPlantilla(archivo, contexto);
    const muestra = Object.fromEntries(r.faltantes.map(base).filter((v) => /^[\w.]+$/.test(v)).map((v) => [v, valorDeMuestra(v)]));
    const deMuestra = Object.keys(muestra);
    if (deMuestra.length) r = renderizarPlantilla(archivo, completarContexto(contexto, muestra));
    return { caso: info, docx: r.docx, parrafos: vistaPreviaDocx(r.docx, { marcarFaltantes: true }), faltantes: r.faltantes, deMuestra };
  } catch (e) {
    if (e instanceof ErrorDatos) return { caso: info, error: `El caso de ejemplo no tiene: ${e.faltantes.join(', ')}` };
    return { caso: info, error: `La plantilla no se pudo llenar: ${mensajeError(e)}` };
  }
}

/** Valores ficticios guardados con la versión al convertir un caso real */
export const valoresEjemploDe = (p: Pick<Plantilla, 'variabilizacion'>): ValoresEjemplo =>
  (p.variabilizacion as { valoresEjemplo?: Record<string, string> } | null)?.valoresEjemplo;

async function verificar(p: Pick<Plantilla, 'id' | 'tipoId' | 'archivo' | 'variabilizacion'>) {
  const parrafos = vistaPreviaDocx(Buffer.from(p.archivo));
  const etiquetas = etiquetasDe(parrafos);
  const aprobada = await db.plantilla.findFirst({ where: { tipoId: p.tipoId, estado: 'APROBADA', id: { not: p.id } }, orderBy: { version: 'desc' } });
  const parrafosAprobada = aprobada ? vistaPreviaDocx(Buffer.from(aprobada.archivo)) : null;
  const todas = (e: EtiquetasPlantilla) => [...e.variables, ...e.condiciones];
  const previas = parrafosAprobada ? todas(etiquetasDe(parrafosAprobada)) : null;
  const prueba = await probarConEjemplo(p.tipoId, Buffer.from(p.archivo), valoresEjemploDe(p));
  const automatica: VerificacionAutomatica = {
    etiquetas,
    comparadaCon: aprobada?.version ?? null,
    nuevas: previas ? todas(etiquetas).filter((x) => !previas.includes(x)) : [],
    eliminadas: previas ? previas.filter((x) => !todas(etiquetas).includes(x)) : [],
    prueba: prueba && ('error' in prueba
      ? { caso: prueba.caso.clave, descripcion: prueba.caso.descripcion, faltantes: [], error: prueba.error }
      : { caso: prueba.caso.clave, descripcion: prueba.caso.descripcion, faltantes: prueba.faltantes, deMuestra: prueba.deMuestra }),
  };
  return {
    automatica,
    texto: textoDeParrafos(parrafos),
    textoAprobada: parrafosAprobada ? textoDeParrafos(parrafosAprobada) : null,
    textoEjemplo: prueba && 'parrafos' in prueba ? textoDeParrafos(prueba.parrafos) : null,
  };
}

/** Lo que la IA debe saber de la conversión automática de un caso real (sin datos personales) */
function textoConversion(v: Variabilizacion | null): string | null {
  if (!v?.esCasoReal || v.error) return null;
  return [
    `CONVERSIÓN AUTOMÁTICA: el archivo cargado era la escritura de un caso real; el sistema reemplazó ${v.reemplazos.length} dato(s) por variables:`,
    ...v.reemplazos.map((r) => `- ${r.dato} → ${r.variable} (${r.veces} vez/veces)`),
    v.noAplicados.length ? `Datos que no se pudieron reemplazar (siguen escritos): ${v.noAplicados.map((x) => x.dato).join('; ')}` : '',
    v.nuevas.length ? `Variables nuevas que el sistema aún no conoce: ${v.nuevas.map((x) => `{{${x}}}`).join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

function solicitud(p: Pick<Plantilla, 'version' | 'nombreArchivo' | 'notas' | 'variabilizacion'> & { tipo: { id: string; nombre: string; categoria: string; esBloque: boolean; descripcion: string | null; normas: string | null } }, v: Awaited<ReturnType<typeof verificar>>): string {
  const a = v.automatica;
  const lista = (xs: string[]) => (xs.length ? xs.map((x) => `{{${x}}}`).join(', ') : 'ninguna');
  return [
    `TIPO: ${p.tipo.nombre} (${p.tipo.id}) · ${p.tipo.esBloque ? 'bloque común de todas las escrituras' : p.tipo.categoria}`,
    p.tipo.descripcion && `Descripción: ${p.tipo.descripcion}`,
    p.tipo.normas && `Referencia normativa registrada (pendiente de validar por el notario): ${p.tipo.normas}`,
    `VERSIÓN EN REVISIÓN: ${p.version} (archivo ${p.nombreArchivo})`,
    p.notas && `Notas de quien la cargó: ${p.notas}`,
    textoConversion(p.variabilizacion as Variabilizacion | null),
    '',
    'VERIFICACIÓN AUTOMÁTICA:',
    a.comparadaCon
      ? `- Frente a la versión aprobada ${a.comparadaCon}: etiquetas nuevas ${lista(a.nuevas)}; etiquetas que ya no aparecen ${lista(a.eliminadas)}.`
      : '- No hay versión aprobada con la cual comparar.',
    a.prueba
      ? a.prueba.error
        ? `- Prueba con datos ficticios (${a.prueba.descripcion}): ${a.prueba.error}`
        : `- Prueba con datos ficticios (${a.prueba.descripcion}): variables que el caso de ejemplo no trae (el formulario del expediente aún no las pide): ${lista([...(a.prueba.deMuestra ?? []), ...a.prueba.faltantes])}.`
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

/**
 * Versión en la que la revisión encontró datos de un caso real (hallazgos «Dato fijo» que no son solo
 * informativos) o que no tiene ninguna variable: las cargadas antes de la conversión automática o
 * aquellas en que la conversión al cargar falló o quedó incompleta. Cada versión se reintenta una
 * sola vez (intentoPosterior): así la lista se vacía y desaparece.
 */
export function tieneDatosReales(p: Pick<Plantilla, 'revision' | 'variabilizacion'>): boolean {
  const revision = p.revision as RevisionPlantilla | null;
  if (!revision || (p.variabilizacion as Variabilizacion | null)?.intentoPosterior) return false;
  return !!revision.ia?.hallazgos.some((h) => h.categoria === 'DATO_FIJO' && h.nivel !== 'INFORMATIVA')
    || revision.automatica.etiquetas.variables.length === 0;
}
