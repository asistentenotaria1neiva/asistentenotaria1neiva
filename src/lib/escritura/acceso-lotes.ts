/**
 * Revisión sin IA del acceso de los lotes en un desenglobe, subdivisión, división material,
 * fraccionamiento o loteo. Decreto 1077 de 2015: cada lote resultante debe tener salida a una vía
 * pública o una servidumbre de tránsito legalmente constituida; ninguno puede quedar encerrado.
 *
 * Se buscan en la escritura los linderos de cada lote (un párrafo, o varios seguidos, con al menos tres
 * costados) y se mira si alguno de sus costados colinda con una vía. Si un lote no tiene vía y la
 * escritura no constituye una servidumbre de tránsito, es una advertencia CRÍTICA.
 */
import type { Advertencia } from '../ia/instrucciones';

/** La escritura es una división del inmueble */
const DIVISION = /\b(?:desenglob\w*|subdivi(?:si[oó]n|did\w*|dir)|divisi[oó]n\s+material|fraccionami?ento|loteo|parcelaci[oó]n|segregaci[oó]n)\b/i;

const PUNTOS = 'NORTE|SUR|ORIENTE|OCCIDENTE|NORORIENTE|NOROCCIDENTE|SURORIENTE|SUROCCIDENTE|NORESTE|NOROESTE|SURESTE|SUROESTE';
/** Un costado de un lindero: «POR EL NORTE…», «NORTE:», «NORTE, del punto…», «NORTE.- Linda con…» */
const COSTADO = new RegExp(`\\bPOR\\s+EL\\s+(${PUNTOS})\\b|\\b(${PUNTOS})\\s*(?::|\\.-|-|,\\s*(?:del|desde|con|en|partiendo|linda|colinda|limita))`, 'gi');

/**
 * Colindancia con una vía pública o un acceso: calle, carrera, vía, carretera, carreteable, camino,
 * avenida, pasaje, callejón… o una servidumbre (de tránsito, de paso, de acceso).
 */
const VIA = /\b(?:v[ií]as?|calles?|carreras?|avenidas?|diagonal|transversal|carreteras?|carreteables?|caminos?|callej[oó]n|pasajes?|senderos?|troncal|autopista|variante|andenes?|and[eé]n|servidumbres?|zona\s+de\s+(?:vía|acceso))\b/i;

/** La escritura constituye (o cita una ya inscrita) servidumbre de tránsito, de paso o de acceso */
const SERVIDUMBRE = /servidumbre\s+(?:\w+\s+){0,3}(?:de\s+)?(?:tr[aá]nsito|paso|acceso|v[ií]a)|constitu\w*\s+(?:\w+\s+){0,4}servidumbre/i;

/** El lote de mayor extensión (el que se divide) no es un lote resultante */
const MAYOR_EXTENSION = /mayor\s+extensi[oó]n|predio\s+matriz|lote\s+matriz|globo\s+de\s+terreno|inmueble\s+(?:que\s+se\s+)?(?:desenglob|subdivid|divid)/i;

/** Nombre del lote, del comienzo del bloque o del párrafo anterior («LOTE A», «LOTE No. 1 BARRANQUILLA») */
const NOMBRE_LOTE = /\b(LOTE\s+(?:N(?:[oO°º]|[uú]mero)\.?\s*)?[0-9A-ZÁÉÍÓÚÑ][\w.-]*(?:\s+(?![Cc]on\b|[Ll]inda|[Pp]or\b|[Cc]uyos?\b|[Dd]e\b|[Yy]\b)[A-ZÁÉÍÓÚÑ]{3,}){0,2})/;

interface Bloque { desde: number; texto: string; costados: Set<string>; presentacion: string; acceso: string | null }

function costados(texto: string): Set<string> {
  return new Set([...texto.matchAll(COSTADO)].map((m) => (m[1] ?? m[2]).toUpperCase()));
}

/** Párrafo que presenta los linderos de un lote («…determinado por los siguientes linderos:») */
const PRESENTA = /siguientes\s+linderos|alinderad[oa]|linderos\s+(?:son|del\s+lote\s+son)|cuyos\s+linderos\s+(?:son|actuales)/i;
/** Líneas que van dentro de los linderos sin nombrar un costado */
const DENTRO = /^\s*(?:PUNTO\s+DE\s+PARTIDA|ACCESO|PAR[ÁA]GRAFO|«FALTA|\[VERIFICAR)/i;
const LINEA_ACCESO = /^\s*ACCESO(?:\s+VIAL)?\s*:\s*(.*)$/i;

/**
 * Linderos de cada lote: desde el párrafo que los presenta (o desde un párrafo que ya trae tres
 * costados), con los párrafos seguidos que nombran costados, el punto de partida o el acceso.
 */
function bloquesDeLinderos(parrafos: string[]): Bloque[] {
  const bloques: Bloque[] = [];
  let actual: Bloque | null = null;
  const cerrar = () => { if (actual && (actual.costados.size >= 3 || (actual.presentacion && actual.costados.size >= 1))) bloques.push(actual); actual = null; };
  parrafos.forEach((p, i) => {
    if (!p.trim()) return;
    const c = costados(p);
    const acceso = p.match(LINEA_ACCESO);
    if (PRESENTA.test(p) && c.size < 2) { cerrar(); actual = { desde: i, texto: '', costados: new Set(), presentacion: p, acceso: null }; return; }
    if (acceso && actual) { actual.acceso = acceso[1]; return; }
    if (!c.size) { if (!(actual && DENTRO.test(p))) cerrar(); return; }
    // Un párrafo con sus propios linderos completos, sin presentación antes, es un lote aparte
    if (c.size >= 3 && !(actual && !actual.costados.size)) { cerrar(); bloques.push({ desde: i, texto: p, costados: c, presentacion: PRESENTA.test(parrafos[i - 1] ?? '') ? parrafos[i - 1] : '', acceso: null }); return; }
    if (!actual) actual = { desde: i, texto: '', costados: new Set(), presentacion: '', acceso: null };
    actual.texto += `${p}\n`;
    for (const x of c) actual.costados.add(x);
  });
  cerrar();
  return bloques;
}

/** Desde dónde empiezan los lotes resultantes («…procede a SUBDIVIDIR dicho inmueble, del cual surgen dos lotes…») */
const RESULTAN = /(?:surgen|resultan|quedan|se\s+forman)\s+(?:\w+\s+){0,4}lotes|proced\w*\s+a\s+(?:subdividir|desenglobar|dividir|lotear|fraccionar|parcelar)/i;

/** Tramo de cada costado (desde su marca hasta la siguiente) */
function tramos(texto: string): string[] {
  const marcas = [...texto.matchAll(COSTADO)];
  return marcas.map((m, i) => texto.slice(m.index!, marcas[i + 1]?.index ?? texto.length));
}

/** Categorías de la biblioteca que dividen el inmueble en lotes */
const CATEGORIAS_DIVISION = /^(?:DESENGLOBE|PARCELACION|RELOTEO|CONSTITUCION URBANIZACION|REFORMA CONSTITUCION URBANIZACION)$/i;

/**
 * ¿La escritura divide el inmueble? Por la categoría de la plantilla, su nombre o las indicaciones del
 * digitador. No se mira toda la escritura: una compraventa de un lote que salió de un desenglobe
 * anterior lo menciona en la tradición, y no es una división.
 */
export function esDivision(o: { categoria?: string | null; plantilla?: string | null; observaciones?: string | null; caratula?: string }): boolean {
  if (o.categoria && CATEGORIAS_DIVISION.test(o.categoria.trim())) return true;
  return DIVISION.test(`${o.plantilla ?? ''}\n${o.observaciones ?? ''}\n${o.caratula ?? ''}`);
}

export function revisarAccesoDeLotes(texto: string, opciones: { esDivision: boolean }): Advertencia[] {
  if (!opciones.esDivision) return [];
  const parrafos = texto.split('\n');
  const inicio = parrafos.findIndex((p) => RESULTAN.test(p));
  const lotes = bloquesDeLinderos(parrafos).filter((b) => (inicio >= 0 ? b.desde > inicio : !MAYOR_EXTENSION.test(`${b.presentacion.slice(-400)} ${b.texto.slice(0, 250)}`)));
  if (!lotes.length) return [];
  const conServidumbre = SERVIDUMBRE.test(texto);
  // Con vía: un costado colinda con una vía, o la línea de acceso del lote la nombra (no «FALTA»)
  const tieneVia = (b: Bloque) => tramos(b.texto).some((t) => VIA.test(t)) || (!!b.acceso && !/FALTA/i.test(b.acceso) && VIA.test(b.acceso));
  const sinVia = lotes.filter((b) => !tieneVia(b));
  if (!sinVia.length) return [];

  const nombre = (b: Bloque, i: number) => {
    const denominado = b.presentacion.match(/(?:se\s+denominar[áa]|denominad[oa])\s+(?:como\s+)?(LOTE\b[^,;:]*)/i)?.[1];
    const encontrado = denominado ?? `${b.presentacion.slice(-300)} ${b.texto.slice(0, 200)}`.match(NOMBRE_LOTE)?.[1];
    return encontrado?.replace(/\s+/g, ' ').replace(/[\s.]+$/, '').trim() ?? `lote ${i + 1} (linderos del párrafo que empieza «${b.texto.slice(0, 50).trim()}…»)`;
  };
  const nombres = [...new Set(sinVia.map((b) => nombre(b, lotes.indexOf(b))))];
  const cuales = nombres.length === 1 ? `El ${nombres[0]} no colinda` : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)} no colindan`;
  if (conServidumbre) {
    return [{ nivel: 'ADVERTENCIA', origen: 'SISTEMA', p: 0, detalle: `${cuales} con ninguna vía según sus linderos; la escritura menciona una servidumbre. Confirme que esa servidumbre de tránsito queda legalmente constituida a favor de ${nombres.length === 1 ? 'ese lote' : 'cada uno'} (Decreto 1077 de 2015).` }];
  }
  return [{
    nivel: 'CRITICA', origen: 'SISTEMA', p: 0,
    detalle: `${cuales} con ninguna vía pública según sus linderos, y la escritura no constituye servidumbre de tránsito. Por el Decreto 1077 de 2015 ningún lote resultante de la división puede quedar encerrado: verifique el acceso en la licencia y el plano, y agregue la vía o constituya la servidumbre antes de otorgar.`,
  }];
}
