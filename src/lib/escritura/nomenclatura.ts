/**
 * La nomenclatura (dirección) del inmueble se toma del certificado de tradición, que suele traerla
 * abreviada («CLL 5 # 10-20 MZ 3 LT 4»). En la escritura va completa («CALLE 5 NÚMERO 10-20 MANZANA 3
 * LOTE 4»). Se aplica a todo el texto nuevo que la IA escribe en la escritura (no a la parte fija de
 * la plantilla).
 *
 * Para no tocar texto que no es una dirección, las abreviaturas de vía, manzana, lote, casa, etc. solo
 * se completan si van seguidas de un número, y «#» / «No.» solo dentro de una dirección
 * («CALLE 5 # 10-20»), nunca en «Escritura No. 123» o «C.C. No.».
 */

/** Abreviatura (sin punto) → palabra completa. Solo se completa si le sigue un número. */
const ANTES_DE_NUMERO: Record<string, string> = {
  CLLE: 'CALLE', CLL: 'CALLE', CALL: 'CALLE', CL: 'CALLE',
  CRA: 'CARRERA', CRR: 'CARRERA', CARR: 'CARRERA', CR: 'CARRERA', KRA: 'CARRERA', KRR: 'CARRERA', KR: 'CARRERA',
  AVDA: 'AVENIDA', AVE: 'AVENIDA', AV: 'AVENIDA',
  AK: 'AVENIDA CARRERA', AC: 'AVENIDA CALLE',
  DIAG: 'DIAGONAL', DG: 'DIAGONAL',
  TRANSV: 'TRANSVERSAL', TRV: 'TRANSVERSAL', TV: 'TRANSVERSAL', TR: 'TRANSVERSAL',
  CIRC: 'CIRCULAR', CIR: 'CIRCULAR', CRV: 'CIRCUNVALAR', CQ: 'CIRCUNVALAR',
  MZA: 'MANZANA', MZ: 'MANZANA',
  LT: 'LOTE', LTE: 'LOTE',
  CS: 'CASA',
  APTO: 'APARTAMENTO', APT: 'APARTAMENTO', AP: 'APARTAMENTO',
  BLOQ: 'BLOQUE', BLQ: 'BLOQUE', BL: 'BLOQUE',
  TORR: 'TORRE', TO: 'TORRE',
  ETP: 'ETAPA', ET: 'ETAPA',
  LOC: 'LOCAL', LC: 'LOCAL',
  OFC: 'OFICINA', OF: 'OFICINA',
  PQ: 'PARQUEADERO',
  KM: 'KILÓMETRO',
};

/** Abreviaturas inequívocas que se completan aunque no les siga un número (antes de un nombre o una letra: «MZ B») */
const ANTES_DE_NOMBRE: Record<string, string> = {
  MZA: 'MANZANA', MZ: 'MANZANA', APTO: 'APARTAMENTO', BLOQ: 'BLOQUE', BLQ: 'BLOQUE', TORR: 'TORRE',
  BRR: 'BARRIO', URB: 'URBANIZACIÓN', CONJ: 'CONJUNTO', CJTO: 'CONJUNTO', VDA: 'VEREDA', EDIF: 'EDIFICIO', RESID: 'RESIDENCIAL',
};

const claves = (m: Record<string, string>) => Object.keys(m).filter((k) => m[k] !== k).sort((a, b) => b.length - a.length).join('|');

// Sin letra ni número pegado antes; la abreviatura puede llevar punto
const RE_NUMERO = new RegExp(`(?<![\\p{L}\\d])(${claves(ANTES_DE_NUMERO)})\\.?\\s*(?=\\d)`, 'giu');
const RE_NOMBRE = new RegExp(`(?<![\\p{L}\\d])(${claves(ANTES_DE_NOMBRE)})(?:\\.\\s*|\\s+)(?=\\p{L})`, 'giu');

// «CALLE 5A BIS SUR # 10-20» → el signo «#», «No.», «N°» o «Nro.» pasa a «NÚMERO»
const VIA = '(?:AVENIDA (?:CALLE|CARRERA)|CALLE|CARRERA|AVENIDA|DIAGONAL|TRANSVERSAL|CIRCULAR|CIRCUNVALAR)';
const RE_SIGNO = new RegExp(`(?<![\\p{L}\\d])(${VIA}\\s+\\d+(?:\\s*[A-Z](?![\\p{L}]))?(?:\\s*BIS)?(?:\\s*[A-Z](?![\\p{L}]))?(?:\\s+(?:SUR|ESTE|NORTE|OESTE))?)\\s*(?:#|N[°º]\\.?|NRO\\.?|NO\\.?)\\s*(?=\\d)`, 'giu');

/** Respeta las mayúsculas de lo escrito: «CLL» → «CALLE», «Cll» o «cll» → «Calle» */
function comoLoEscrito(abreviatura: string, completa: string): string {
  if (abreviatura === abreviatura.toUpperCase()) return completa;
  return completa.toLowerCase().replace(/(^|\s)\p{L}/gu, (l) => l.toUpperCase());
}

export function expandirNomenclatura(texto: string): string {
  if (!texto) return texto;
  return texto
    .replace(RE_NUMERO, (_t, ab: string) => `${comoLoEscrito(ab, ANTES_DE_NUMERO[ab.toUpperCase()]!)} `)
    .replace(RE_NOMBRE, (_t, ab: string) => `${comoLoEscrito(ab, ANTES_DE_NOMBRE[ab.toUpperCase()]!)} `)
    .replace(RE_SIGNO, (_t, via: string) => `${via} ${via === via.toUpperCase() ? 'NÚMERO' : 'número'} `);
}
