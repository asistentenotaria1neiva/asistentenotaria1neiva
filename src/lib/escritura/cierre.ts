/**
 * Renglones del cierre de la escritura que son de la notaría y no del negocio: la referencia interna de
 * control (tipo de escritura, número de plantilla y quien la elabora: «HIPOTECA BBVA 23/ MILAN.»), que va
 * entre «De lo cual doy fe.» y «LOS OTORGANTES,». Se conservan tal cual la plantilla: los documentos
 * cargados (copias de otras escrituras) traen la referencia de OTRA escritura («TATIANA/Sucesiones/2026/0001»)
 * y la IA no debe copiarla.
 */
import { normalizar } from '../texto/normalizar';
import type { CambioParrafo } from './docx';

/** Renglón corto con «/» que no es una norma («Decreto 2148/1983», «Resolución …», «Art. …») */
const esReferencia = (t: string) => {
  const n = normalizar(t);
  return n.length > 0 && n.length <= 90 && n.includes('/') && !/\b(DECRETO|RESOLUCION|LEY|ART|ARTICULO|NIT|C\.C|CEDULA)\b/.test(n) && !/\d{2}\/\d{2}\/\d{4}/.test(n);
};

/** Párrafos de la plantilla que son la referencia interna de control (en la zona de cierre) */
export function referenciasInternas(plantilla: Map<number, string>): number[] {
  const orden = [...plantilla].sort((a, b) => a[0] - b[0]);
  const fe = orden.findIndex(([, t]) => /^DE LO CUAL DOY FE/.test(normalizar(t)));
  if (fe < 0) return [];
  const fin = orden.findIndex(([, t], i) => i > fe && /^LOS OTORGANTES/.test(normalizar(t)));
  return orden.slice(fe + 1, fin < 0 ? fe + 15 : fin).filter(([, t]) => esReferencia(t)).map(([n]) => n);
}

/** Quita los cambios que la IA hizo sobre esos párrafos, salvo que las observaciones los pidan */
export function sinCambiosEnReferencias(cambios: CambioParrafo[], plantilla: Map<number, string>, observaciones?: string | null): CambioParrafo[] {
  if (/\bREFERENCIA\b|\bCONTROL\b|RENGLON FINAL|ULTIMO RENGLON/.test(normalizar(observaciones ?? ''))) return cambios;
  const protegidos = new Set(referenciasInternas(plantilla));
  return cambios.filter((c) => !protegidos.has(c.p) || c.accion === 'SOLO_INSERTAR');
}
