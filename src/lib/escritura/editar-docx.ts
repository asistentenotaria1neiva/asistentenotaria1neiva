/**
 * Reemplazo de fragmentos de texto en el cuerpo de un .docx, conservando el formato.
 *
 * Word parte el texto de un párrafo en varias corridas (<w:r>) según el formato, la ortografía
 * o el historial de edición. El fragmento se ubica sobre el texto completo del párrafo (igual que
 * la vista previa) y se reemplaza así: el texto nuevo queda en la primera corrida que toca el
 * fragmento, con su formato, y el resto del fragmento se borra de las corridas siguientes.
 * No se reemplaza nada que cruce un párrafo, una tabulación o un salto de línea.
 *
 * Con `marcar` (revisión de escrituras) el cambio queda a la vista: el texto eliminado se conserva
 * tachado en rojo y el texto nuevo va resaltado en amarillo, cada uno con el formato de su corrida.
 */
import PizZip from 'pizzip';

export type ResultadoReemplazo = 'APLICADO' | 'NO_ENCONTRADO' | 'AMBIGUO' | 'CRUZA_FORMATO';

const entidades = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Marcas de la revisión: lo eliminado, tachado en rojo; lo agregado, resaltado en amarillo */
const ELIMINADO = { strike: '<w:strike/>', color: '<w:color w:val="FF0000"/>' };
const AGREGADO = { highlight: '<w:highlight w:val="yellow"/>' };
/** Número del cambio junto a lo marcado, en rojo y como superíndice: remite a la relación de cambios */
const NOTA = '<w:rPr><w:b/><w:bCs/><w:color w:val="FF0000"/><w:vertAlign w:val="superscript"/></w:rPr>';

/** Cómo se marca un cambio: con `nota`, su número de referencia (p. ej. «[3]») va al final */
export interface Marca { nota?: string }

/** Orden de las propiedades de una corrida en el esquema de Word (fuera de orden, Word puede no abrir el archivo) */
const ORDEN_RPR = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'];
const posicion = (nombre: string) => { const i = ORDEN_RPR.indexOf(nombre); return i < 0 ? Infinity : i; };

/** Las propiedades de la corrida con las de `agregar` puestas en su lugar (sin el historial de cambios de Word) */
export function conFormato(rPr: string, agregar: Record<string, string>): string {
  const interior = rPr.match(/^<w:rPr>([\s\S]*)<\/w:rPr>$/)?.[1] ?? '';
  const hijos = [...interior.matchAll(/<w:(\w+)\b(?:[^>]*?\/>|[^>]*>[\s\S]*?<\/w:\1>)/g)]
    .map((m) => ({ nombre: m[1], xml: m[0] }))
    .filter((h) => h.nombre !== 'rPrChange' && !(h.nombre in agregar) && !(h.nombre === 'dstrike' && 'strike' in agregar));
  for (const [nombre, xml] of Object.entries(agregar)) {
    const k = hijos.findIndex((h) => posicion(h.nombre) > posicion(nombre));
    hijos.splice(k < 0 ? hijos.length : k, 0, { nombre, xml });
  }
  return `<w:rPr>${hijos.map((h) => h.xml).join('')}</w:rPr>`;
}

/** Propiedades de una corrida (<w:rPr>…</w:rPr>, que puede traer un <w:rPrChange> con otro <w:rPr> dentro) */
function rPrDe(corrida: string): string {
  const inicio = corrida.match(/^<w:r\b[^>]*>\s*/)?.[0].length ?? 0;
  const resto = corrida.slice(inicio);
  if (resto.startsWith('<w:rPr/>')) return '';
  if (!resto.startsWith('<w:rPr>')) return '';
  const cambio = resto.indexOf('</w:rPrChange>');
  const fin = resto.indexOf('</w:rPr>', cambio < 0 ? 0 : cambio + 14);
  return fin < 0 ? '' : resto.slice(0, fin + 8);
}

/** Corrida con el texto eliminado por una revisión anterior: ya no cuenta como texto del párrafo */
const esEliminado = (rPr: string) => rPr.includes(ELIMINADO.strike) && rPr.includes(ELIMINADO.color);
/** Corrida con el texto agregado por una revisión anterior */
const esAgregado = (rPr: string) => rPr.includes(AGREGADO.highlight);
/** Corrida con el número de un cambio */
const esNota = (rPr: string) => rPr === NOTA;

/** Pieza del texto de un párrafo: un nodo <w:t> (editable) o una tabulación/salto (no editable) */
interface Pieza { inicio: number; fin: number; xmlInicio: number; xmlFin: number; editable: boolean; texto: string; rPr: string }

function piezas(parrafo: string, marcar = false): { texto: string; piezas: Pieza[] } {
  const lista: Pieza[] = [];
  let texto = '';
  for (const r of parrafo.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)) {
    const rPr = rPrDe(r[0]);
    // Lo tachado por un cambio anterior sigue en el documento, pero los siguientes cambios no lo ven
    if (marcar && (esEliminado(rPr) || esNota(rPr))) continue;
    for (const t of r[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tab)\/>|<w:(br|cr)\b[^>]*\/>/g)) {
      const contenido = t[1] !== undefined ? entidades(t[1]) : t[2] ? '\t' : '\n';
      const xmlInicio = r.index + t.index;
      lista.push({ inicio: texto.length, fin: texto.length + contenido.length, xmlInicio, xmlFin: xmlInicio + t[0].length, editable: t[1] !== undefined, texto: contenido, rPr });
      texto += contenido;
    }
  }
  return { texto, piezas: lista };
}

const nodoTexto = (s: string) => (s ? `<w:t xml:space="preserve">${escapar(s)}</w:t>` : '');
const corrida = (rPr: string, s: string) => `<w:r>${rPr}${nodoTexto(s)}</w:r>`;

/** Letras y signos que se consideran iguales al ubicar un fragmento (la IA puede copiarlos distinto) */
const EQUIVALENTES = ['aáàäâ', 'eéèëê', 'iíìïî', 'oóòöô', 'uúùüû', 'nñ', '"“”«»', "'‘’´`", '-‐‑–—'];
const CLASE = new Map(EQUIVALENTES.flatMap((g) => [...g].map((c) => [c, `[${g.replace(/[\]\\^-]/g, '\\$&')}]`] as const)));
const caracter = (c: string) => CLASE.get(c.toLowerCase()) ?? c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Expresión que ubica el fragmento tolerando diferencias de espacios, mayúsculas, tildes, comillas
 * y guiones (la IA puede normalizarlos al copiarlo)
 */
const patron = (fragmento: string) => new RegExp(fragmento.trim().split(/\s+/).map((p) => [...p].map(caracter).join('')).join('[\\s\\u00a0]+'), 'giu');

/** Igual, pero sin tomar el fragmento dentro de una palabra o número más largo ("ANA" no se toma en "ANALIZA") */
const patronPalabra = (fragmento: string) => {
  const p = patron(fragmento).source;
  const borde = (c: string) => /[\p{L}\p{N}]/u.test(c);
  const t = fragmento.trim();
  return new RegExp(`${borde(t[0]) ? '(?<![\\p{L}\\p{N}])' : ''}${p}${borde(t.at(-1)!) ? '(?![\\p{L}\\p{N}])' : ''}`, 'giu');
};

/** Reemplaza [a, b) del texto del párrafo por `nuevo`; null si el rango cruza algo no editable */
function reemplazarEnParrafo(parrafo: string, lista: Pieza[], a: number, b: number, nuevo: string, marca: Marca | null = null): string | null {
  const tocadas = lista.filter((p) => p.fin > a && p.inicio < b);
  if (!tocadas.length || tocadas.some((p) => !p.editable)) return null;
  let salida = parrafo;
  // De atrás hacia adelante, para que las posiciones en el XML sigan siendo válidas
  for (let i = tocadas.length - 1; i >= 0; i--) {
    const p = tocadas[i];
    if (marca) {
      // La corrida se parte: lo de antes y lo de después siguen con su formato; en medio, lo
      // eliminado (tachado en rojo) y, tras la última pieza, el texto nuevo (resaltado en amarillo)
      const ini = Math.max(a, p.inicio) - p.inicio;
      const fin = Math.min(b, p.fin) - p.inicio;
      // Lo agregado por un cambio anterior no estaba en el original: si otro cambio lo quita, desaparece sin tacharse
      const eliminado = esAgregado(p.rPr) ? '' : p.texto.slice(ini, fin);
      const ultima = i === tocadas.length - 1;
      const agregado = (ultima && nuevo ? corrida(conFormato(tocadas[0].rPr, AGREGADO), nuevo) : '') + (ultima && marca.nota ? corrida(NOTA, marca.nota) : '');
      const reemplazo = `${nodoTexto(p.texto.slice(0, ini))}</w:r>${eliminado ? corrida(conFormato(p.rPr, ELIMINADO), eliminado) : ''}${agregado}<w:r>${p.rPr}${nodoTexto(p.texto.slice(fin))}`;
      salida = `${salida.slice(0, p.xmlInicio)}${reemplazo}${salida.slice(p.xmlFin)}`;
      // Al partir las corridas quedan algunas vacías: se quitan
      if (i === 0) salida = salida.replace(/<w:r>(?:<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)?<\/w:r>/g, '');
      continue;
    }
    const antes = i === 0 ? p.texto.slice(0, a - p.inicio) : '';
    const despues = i === tocadas.length - 1 ? p.texto.slice(b - p.inicio) : '';
    const texto = antes + (i === 0 ? nuevo : '') + despues;
    salida = `${salida.slice(0, p.xmlInicio)}<w:t xml:space="preserve">${escapar(texto)}</w:t>${salida.slice(p.xmlFin)}`;
  }
  return salida;
}

/** Aplica un reemplazo sobre el XML del documento; el fragmento debe aparecer una sola vez */
function reemplazarEnDocumento(xml: string, original: string, nuevo: string, marca: Marca | null = null): { xml: string; resultado: ResultadoReemplazo } {
  const inicioCuerpo = xml.indexOf('<w:body>');
  const encontrados: { parrafo: RegExpExecArray; datos: ReturnType<typeof piezas>; a: number; b: number }[] = [];
  for (const parrafo of xml.slice(inicioCuerpo).matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const datos = piezas(parrafo[0], !!marca);
    for (const m of datos.texto.matchAll(patron(original))) encontrados.push({ parrafo: parrafo as RegExpExecArray, datos, a: m.index, b: m.index + m[0].length });
  }
  if (!encontrados.length) return { xml, resultado: 'NO_ENCONTRADO' };
  if (encontrados.length > 1) return { xml, resultado: 'AMBIGUO' };
  const { parrafo, datos, a, b } = encontrados[0];
  const editado = reemplazarEnParrafo(parrafo[0], datos.piezas, a, b, nuevo, marca);
  if (editado === null) return { xml, resultado: 'CRUZA_FORMATO' };
  const inicio = inicioCuerpo + parrafo.index;
  return { xml: xml.slice(0, inicio) + editado + xml.slice(inicio + parrafo[0].length), resultado: 'APLICADO' };
}

/**
 * Reemplaza TODAS las apariciones del fragmento (p. ej. un nombre que se repite en la escritura).
 * En cada párrafo se avanza de atrás hacia adelante: el texto anterior al cambio no se mueve.
 */
function reemplazarTodasEnDocumento(xml: string, original: string, nuevo: string, marca: Marca | null = null): { xml: string; resultado: ResultadoReemplazo; veces: number } {
  const inicioCuerpo = xml.indexOf('<w:body>');
  const expresion = patronPalabra(original);
  let veces = 0;
  let cruza = 0;
  const cuerpo = xml.slice(inicioCuerpo).replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (parrafo) => {
    let limite = Infinity;
    for (;;) {
      const datos = piezas(parrafo, !!marca);
      const m = [...datos.texto.matchAll(expresion)].filter((x) => x.index + x[0].length <= limite).at(-1);
      if (!m) return parrafo;
      limite = m.index;
      const editado = reemplazarEnParrafo(parrafo, datos.piezas, m.index, m.index + m[0].length, nuevo, marca);
      if (editado === null) cruza++;
      else { parrafo = editado; veces++; }
    }
  });
  const resultado: ResultadoReemplazo = veces ? 'APLICADO' : cruza ? 'CRUZA_FORMATO' : 'NO_ENCONTRADO';
  return { xml: veces ? xml.slice(0, inicioCuerpo) + cuerpo : xml, resultado, veces };
}

/**
 * Aplica los reemplazos en orden. `aceptar` revisa el documento después de cada reemplazo
 * (p. ej. que las etiquetas sigan bien formadas); si lo rechaza, ese reemplazo se deshace.
 * Con `todas`, el reemplazo se hace en cada aparición del fragmento; `veces` dice cuántas fueron.
 */
export function reemplazarEnDocx(
  docx: Buffer,
  reemplazos: { original: string; nuevo: string; todas?: boolean; /** Con marcar: número de referencia del cambio */ nota?: string }[],
  aceptar: (docx: Buffer) => string | null = () => null,
  /** Deja el cambio a la vista: lo eliminado tachado en rojo y lo agregado resaltado en amarillo */
  opciones: { marcar?: boolean } = {},
): { docx: Buffer; resultados: (ResultadoReemplazo | { rechazado: string })[]; veces: number[] } {
  const zip = new PizZip(docx);
  let xml = zip.file('word/document.xml')?.asText() ?? '';
  const generar = (x: string) => { zip.file('word/document.xml', x); return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }); };
  const resultados: (ResultadoReemplazo | { rechazado: string })[] = [];
  const veces: number[] = [];
  for (const r of reemplazos) {
    veces.push(0);
    if (!r.original.trim()) { resultados.push('NO_ENCONTRADO'); continue; }
    const marca = opciones.marcar ? { nota: r.nota } : null;
    const intento = r.todas ? reemplazarTodasEnDocumento(xml, r.original, r.nuevo, marca) : { ...reemplazarEnDocumento(xml, r.original, r.nuevo, marca), veces: 1 };
    if (intento.resultado !== 'APLICADO') { resultados.push(intento.resultado); continue; }
    const motivo = aceptar(generar(intento.xml));
    if (motivo) { resultados.push({ rechazado: motivo }); continue; }
    xml = intento.xml;
    resultados.push('APLICADO');
    veces[veces.length - 1] = intento.veces;
  }
  return { docx: generar(xml), resultados, veces };
}

/**
 * Los mismos reemplazos sobre el texto de unos párrafos (sin Word): ubican el fragmento igual que
 * reemplazarEnDocx (tolerando mayúsculas, tildes, comillas, guiones y espacios) y no cruzan párrafos,
 * tabulaciones ni saltos de línea. Sirve para armar la versión limpia con el formato bien calculado.
 */
export function reemplazarEnTextos(textos: string[], reemplazos: { original: string; nuevo: string; todas?: boolean }[]): { textos: string[]; resultados: ResultadoReemplazo[] } {
  const salida = [...textos];
  const resultados: ResultadoReemplazo[] = [];
  // Tabulaciones y saltos no se cruzan, como en el Word
  const cruza = (t: string, a: number, b: number) => /[\t\n]/.test(t.slice(a, b));
  for (const r of reemplazos) {
    if (!r.original.trim()) { resultados.push('NO_ENCONTRADO'); continue; }
    if (r.todas) {
      const expresion = patronPalabra(r.original);
      let veces = 0;
      let cruzan = 0;
      for (let k = 0; k < salida.length; k++) {
        salida[k] = salida[k].replace(expresion, (m, ...resto) => {
          const i = resto[resto.length - 2] as number;
          if (cruza(salida[k], i, i + m.length)) { cruzan++; return m; }
          veces++;
          return r.nuevo;
        });
      }
      resultados.push(veces ? 'APLICADO' : cruzan ? 'CRUZA_FORMATO' : 'NO_ENCONTRADO');
      continue;
    }
    const encontrados = salida.flatMap((t, k) => [...t.matchAll(patron(r.original))].map((m) => ({ k, a: m.index, b: m.index + m[0].length })));
    if (!encontrados.length) { resultados.push('NO_ENCONTRADO'); continue; }
    if (encontrados.length > 1) { resultados.push('AMBIGUO'); continue; }
    const { k, a, b } = encontrados[0];
    if (cruza(salida[k], a, b)) { resultados.push('CRUZA_FORMATO'); continue; }
    salida[k] = salida[k].slice(0, a) + r.nuevo + salida[k].slice(b);
    resultados.push('APLICADO');
  }
  return { textos: salida, resultados };
}
