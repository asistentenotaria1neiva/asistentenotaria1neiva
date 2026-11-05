/**
 * Paz y salvo vigente de cada inmueble. Es común que lleguen varios del mismo predio: el vigente y
 * uno antiguo (el que se protocolizó en la escritura de la hipoteca que se cancela, o en el título
 * de adquisición). Vale el de vigencia más reciente; los antiguos no cuentan para la escritura ni
 * para las reglas, y el formulario se corrige solo si quedó con uno antiguo.
 */
import type { Inmueble } from './tipos';
import type { ResultadoExtraccion } from '../ia/documentos';
import { mismaCatastral } from './comparar';
import { validarCedulaCatastral } from '../validaciones/formatos';

export interface DocPazSalvo { id: string; nombre?: string; hechos?: ResultadoExtraccion | null }
export interface PazSalvoLeido { documentoId: string; nombre?: string; vigencia: string; expedicion: string; catastral: string; entidad?: string; avaluo?: number }

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const valor = (h: ResultadoExtraccion | null | undefined, k: string): unknown => {
  const d = h?.datos?.[k] as { valor?: unknown } | undefined;
  return d && typeof d === 'object' && 'valor' in d ? d.valor : undefined;
};
const fecha = (v: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? String(v).slice(0, 10) : '');

/** Lo que dice un paz y salvo, en el formato del formulario */
export function leerPazSalvo(d: DocPazSalvo): PazSalvoLeido {
  const cat = digitos(valor(d.hechos, 'cedula_catastral'));
  const av = Number(digitos(valor(d.hechos, 'avaluo')));
  const entidad = String(valor(d.hechos, 'entidad') ?? '').trim();
  return {
    documentoId: d.id, nombre: d.nombre, vigencia: fecha(valor(d.hechos, 'vigencia_hasta')), expedicion: fecha(valor(d.hechos, 'fecha_expedicion')),
    catastral: cat, ...(entidad ? { entidad } : {}), ...(av > 0 ? { avaluo: av } : {}),
  };
}

/** Más reciente primero: por la vigencia y, a falta de ella, por la fecha de expedición */
const orden = (a: PazSalvoLeido, b: PazSalvoLeido) => (b.vigencia || b.expedicion).localeCompare(a.vigencia || a.expedicion);

/**
 * Paz y salvos de cada inmueble (id → lista, el vigente primero). Se asocian por la cédula
 * catastral; si el expediente tiene un solo inmueble, todos los que no son de otro predio conocido son suyos.
 */
export function pazYSalvosPorInmueble(inmuebles: Inmueble[], docs: DocPazSalvo[]): Map<string, PazSalvoLeido[]> {
  const r = new Map<string, PazSalvoLeido[]>();
  for (const d of docs) {
    const ps = leerPazSalvo(d);
    let inm = ps.catastral ? inmuebles.find((i) => [i.cedula_catastral, i.cedula_catastral_paz_salvo].some((x) => mismaCatastral(x, ps.catastral))) : undefined;
    if (!inm && inmuebles.length === 1) inm = inmuebles[0];
    if (!inm) continue;
    r.set(inm.id, [...(r.get(inm.id) ?? []), ps]);
  }
  for (const lista of r.values()) lista.sort(orden);
  return r;
}

/**
 * Un paz y salvo vencido hace más de esto es histórico: el que se protocolizó en una escritura
 * anterior (la de la hipoteca que se cancela, el título de adquisición), nunca el de esta escritura.
 * Los paz y salvos se expiden por año: uno vigente o vencido hace unos meses sí es del caso.
 */
export const DIAS_HISTORICO = 365;
const dias = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);
const hoyIso = () => new Date().toISOString().slice(0, 10);
/** Fecha de referencia: la del otorgamiento, o hoy */
export const fechaReferencia = (fechaOtorgamiento?: string) => (fechaOtorgamiento && /^\d{4}-\d{2}-\d{2}/.test(fechaOtorgamiento) ? fechaOtorgamiento.slice(0, 10) : hoyIso());
/** ¿La vigencia (o, sin ella, la expedición) es de hace más de un año? */
export function esHistorico(fecha: string | undefined | null, fechaRef: string): boolean {
  return !!fecha && /^\d{4}-\d{2}-\d{2}/.test(fecha) && dias(fecha.slice(0, 10), fechaRef) > DIAS_HISTORICO;
}

/**
 * Ids de los paz y salvos que no cuentan: los históricos y los que no son el vigente de su inmueble
 * (hay uno más reciente del mismo predio).
 */
export function pazYSalvosAntiguos(porInmueble: Map<string, PazSalvoLeido[]>, fechaRef = hoyIso()): Set<string> {
  return new Set([...porInmueble.values()].flatMap((l) => l.filter((x, i) => i > 0 || esHistorico(x.vigencia || x.expedicion, fechaRef)).map((x) => x.documentoId)));
}

/** Paz y salvos históricos de una lista de documentos (sin necesidad de saber a qué inmueble van) */
export function pazYSalvosHistoricos(docs: DocPazSalvo[], fechaRef = hoyIso()): Set<string> {
  return new Set(docs.map(leerPazSalvo).filter((x) => esHistorico(x.vigencia || x.expedicion, fechaRef)).map((x) => x.documentoId));
}

/** Si el formulario quedó con un paz y salvo histórico, se retira: no es el de esta escritura. Devuelve los inmuebles corregidos. */
export function retirarPazYSalvoHistorico(inmuebles: Inmueble[], fechaRef = hoyIso()): string[] {
  const corregidos: string[] = [];
  for (const i of inmuebles) {
    if (!i.paz_salvo || !esHistorico(i.paz_salvo.vigencia_hasta, fechaRef)) continue;
    delete i.paz_salvo;
    corregidos.push(i.id);
  }
  return corregidos;
}

/**
 * Si el formulario quedó con un paz y salvo antiguo (o sin él), toma los datos del vigente.
 * Devuelve los inmuebles corregidos (modifica la lista).
 */
export function aplicarPazYSalvoVigente(inmuebles: Inmueble[], porInmueble: Map<string, PazSalvoLeido[]>, fechaRef = hoyIso()): string[] {
  const corregidos: string[] = retirarPazYSalvoHistorico(inmuebles, fechaRef);
  for (const i of inmuebles) {
    const vigente = porInmueble.get(i.id)?.[0];
    if (!vigente?.vigencia || esHistorico(vigente.vigencia, fechaRef)) continue;
    const actual = i.paz_salvo?.vigencia_hasta ?? '';
    if (actual && actual >= vigente.vigencia) continue;
    i.paz_salvo = {
      ...(i.paz_salvo ?? {}),
      vigencia_hasta: vigente.vigencia,
      ...(vigente.entidad ? { entidad: vigente.entidad } : {}),
      ...(vigente.avaluo ? { avaluo: vigente.avaluo } : {}),
    } as Inmueble['paz_salvo'];
    if (vigente.catastral && validarCedulaCatastral(vigente.catastral).ok) i.cedula_catastral_paz_salvo = vigente.catastral;
    corregidos.push(i.id);
  }
  return [...new Set(corregidos)];
}
