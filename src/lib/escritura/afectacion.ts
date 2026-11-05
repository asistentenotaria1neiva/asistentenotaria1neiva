/**
 * Afectación a vivienda familiar (Ley 258 de 1996, modificada por la Ley 854 de 2003).
 *
 * No se pregunta: se deduce de los datos del expediente.
 *  - Opera de pleno derecho cuando quien adquiere es casado(a) con sociedad conyugal vigente o
 *    tiene unión marital de hecho, y el inmueble se destina a la habitación de la familia.
 *  - No procede si ningún inmueble es vivienda (lote sin construcción, local, bodega, parqueadero,
 *    depósito) o si ningún adquirente es persona natural.
 *  - Única excepción que se registra: los cónyuges o compañeros manifiestan expresamente, previa
 *    indagación del notario, que NO lo afectan (campo opcional «no_afecta»).
 */

interface PersonaAfectacion { tipo_persona?: string; estado_civil?: string }
interface InmuebleAfectacion { tipo_inmueble?: string; area_construida?: number | string }

export type DecisionAfectacion =
  /** El inmueble no es vivienda o el adquirente es persona jurídica: «No procede … por tratarse de …» */
  | { tipo: 'NO_PROCEDE'; motivo: string }
  /** Adquirentes sin vínculo matrimonial ni marital: «… razón por la cual no procede» */
  | { tipo: 'NO_APLICA' }
  /** Hay vínculo: se afecta por ministerio de la ley, salvo constancia expresa de no afectar */
  | { tipo: 'SI' | 'NO'; vinculo: 'CASADOS' | 'COMPANEROS' };

/** Casado(a) con sociedad conyugal vigente (en cualquier género: CASADO(A), CASADA, CASADO…) */
const CASADO_VIGENTE = /^CASAD[^,]*, CON SOCIEDAD CONYUGAL VIGENTE/i;
const UNION_MARITAL = /CON UNION MARITAL DE HECHO/i;

export function tieneVinculo(p: PersonaAfectacion): boolean {
  return p.tipo_persona !== 'JURIDICA' && (CASADO_VIGENTE.test(p.estado_civil ?? '') || UNION_MARITAL.test(p.estado_civil ?? ''));
}

const NO_VIVIENDA: Record<string, string> = {
  LOCAL: 'un local', BODEGA: 'una bodega', PARQUEADERO: 'un parqueadero', DEPOSITO: 'un depósito',
};

/** ¿Puede destinarse a la habitación de la familia? */
export function esVivienda(i: InmuebleAfectacion): boolean {
  const tipo = i.tipo_inmueble ?? '';
  if (NO_VIVIENDA[tipo]) return false;
  if (tipo === 'LOTE' || tipo === 'PREDIO RURAL') return Number(i.area_construida) > 0;
  return true;
}

function motivoNoVivienda(inmuebles: InmuebleAfectacion[]): string {
  const tipos = [...new Set(inmuebles.map((i) => i.tipo_inmueble ?? ''))];
  const varios = inmuebles.length > 1;
  // También un predio rural sin construcción: «por tratarse de un lote de terreno sin construcción» (COMPRAVENTA LOTE RURAL, 2026)
  if (tipos.every((t) => t === 'LOTE' || t === 'PREDIO RURAL')) return varios ? 'lotes de terreno sin construcción' : 'un lote de terreno sin construcción';
  if (!varios && NO_VIVIENDA[tipos[0]]) return `${NO_VIVIENDA[tipos[0]]}, inmueble no destinado a la habitación de la familia`;
  return 'inmuebles no destinados a la habitación de la familia';
}

/**
 * Decide la afectación con los adquirentes, el cónyuge o compañero que coadyuva (si lo hay) y los
 * inmuebles. `noAfecta`: constancia expresa de los cónyuges o compañeros de que NO lo afectan.
 */
export function deducirAfectacion(
  compradores: PersonaAfectacion[], inmuebles: InmuebleAfectacion[], opciones: { coadyuvante?: PersonaAfectacion; noAfecta?: boolean } = {},
): DecisionAfectacion {
  if (inmuebles.length && !inmuebles.some(esVivienda)) return { tipo: 'NO_PROCEDE', motivo: motivoNoVivienda(inmuebles) };
  const naturales = compradores.filter((p) => p.tipo_persona !== 'JURIDICA');
  if (compradores.length && !naturales.length) {
    return { tipo: 'NO_PROCEDE', motivo: compradores.length > 1 ? 'adquirentes que son personas jurídicas' : 'un adquirente que es persona jurídica' };
  }
  const conVinculo = [...naturales, ...(opciones.coadyuvante ? [opciones.coadyuvante] : [])].filter(tieneVinculo);
  if (!conVinculo.length) return { tipo: 'NO_APLICA' };
  const vinculo = conVinculo.some((p) => CASADO_VIGENTE.test(p.estado_civil ?? '')) ? 'CASADOS' : 'COMPANEROS';
  return { tipo: opciones.noAfecta ? 'NO' : 'SI', vinculo };
}

/**
 * Para declarar la afectación (o su constancia de no afectar) deben comparecer ambos cónyuges o
 * compañeros: los dos como compradores, o uno comprando y el otro como coadyuvante.
 */
export function faltaCoadyuvante(compradores: PersonaAfectacion[], coadyuvante?: PersonaAfectacion): boolean {
  return !coadyuvante && compradores.filter(tieneVinculo).length < 2;
}
