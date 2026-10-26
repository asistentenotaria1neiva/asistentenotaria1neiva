/**
 * Reemplazo de fragmentos de texto en el cuerpo de un .docx, conservando el formato.
 *
 * Word parte el texto de un párrafo en varias corridas (<w:r>) según el formato, la ortografía
 * o el historial de edición. El fragmento se ubica sobre el texto completo del párrafo (igual que
 * la vista previa) y se reemplaza así: el texto nuevo queda en la primera corrida que toca el
 * fragmento, con su formato, y el resto del fragmento se borra de las corridas siguientes.
 * No se reemplaza nada que cruce un párrafo, una tabulación o un salto de línea.
 */
import PizZip from 'pizzip';

export type ResultadoReemplazo = 'APLICADO' | 'NO_ENCONTRADO' | 'AMBIGUO' | 'CRUZA_FORMATO';

const entidades = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Pieza del texto de un párrafo: un nodo <w:t> (editable) o una tabulación/salto (no editable) */
interface Pieza { inicio: number; fin: number; xmlInicio: number; xmlFin: number; editable: boolean; texto: string }

function piezas(parrafo: string): { texto: string; piezas: Pieza[] } {
  const lista: Pieza[] = [];
  let texto = '';
  for (const r of parrafo.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)) {
    for (const t of r[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tab)\/>|<w:(br|cr)\b[^>]*\/>/g)) {
      const contenido = t[1] !== undefined ? entidades(t[1]) : t[2] ? '\t' : '\n';
      const xmlInicio = r.index + t.index;
      lista.push({ inicio: texto.length, fin: texto.length + contenido.length, xmlInicio, xmlFin: xmlInicio + t[0].length, editable: t[1] !== undefined, texto: contenido });
      texto += contenido;
    }
  }
  return { texto, piezas: lista };
}

/** Expresión que ubica el fragmento tolerando diferencias de espacios (la IA puede normalizarlos) */
const patron = (fragmento: string) => new RegExp(fragmento.trim().split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\u00a0]+'), 'g');

/** Igual, pero sin tomar el fragmento dentro de una palabra o número más largo ("ANA" no se toma en "ANALIZA") */
const patronPalabra = (fragmento: string) => {
  const p = patron(fragmento).source;
  const borde = (c: string) => /[\p{L}\p{N}]/u.test(c);
  const t = fragmento.trim();
  return new RegExp(`${borde(t[0]) ? '(?<![\\p{L}\\p{N}])' : ''}${p}${borde(t.at(-1)!) ? '(?![\\p{L}\\p{N}])' : ''}`, 'gu');
};

/** Reemplaza [a, b) del texto del párrafo por `nuevo`; null si el rango cruza algo no editable */
function reemplazarEnParrafo(parrafo: string, lista: Pieza[], a: number, b: number, nuevo: string): string | null {
  const tocadas = lista.filter((p) => p.fin > a && p.inicio < b);
  if (!tocadas.length || tocadas.some((p) => !p.editable)) return null;
  let salida = parrafo;
  // De atrás hacia adelante, para que las posiciones en el XML sigan siendo válidas
  for (let i = tocadas.length - 1; i >= 0; i--) {
    const p = tocadas[i];
    const antes = i === 0 ? p.texto.slice(0, a - p.inicio) : '';
    const despues = i === tocadas.length - 1 ? p.texto.slice(b - p.inicio) : '';
    const texto = antes + (i === 0 ? nuevo : '') + despues;
    salida = `${salida.slice(0, p.xmlInicio)}<w:t xml:space="preserve">${escapar(texto)}</w:t>${salida.slice(p.xmlFin)}`;
  }
  return salida;
}

/** Aplica un reemplazo sobre el XML del documento; el fragmento debe aparecer una sola vez */
function reemplazarEnDocumento(xml: string, original: string, nuevo: string): { xml: string; resultado: ResultadoReemplazo } {
  const inicioCuerpo = xml.indexOf('<w:body>');
  const encontrados: { parrafo: RegExpExecArray; datos: ReturnType<typeof piezas>; a: number; b: number }[] = [];
  for (const parrafo of xml.slice(inicioCuerpo).matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const datos = piezas(parrafo[0]);
    for (const m of datos.texto.matchAll(patron(original))) encontrados.push({ parrafo: parrafo as RegExpExecArray, datos, a: m.index, b: m.index + m[0].length });
  }
  if (!encontrados.length) return { xml, resultado: 'NO_ENCONTRADO' };
  if (encontrados.length > 1) return { xml, resultado: 'AMBIGUO' };
  const { parrafo, datos, a, b } = encontrados[0];
  const editado = reemplazarEnParrafo(parrafo[0], datos.piezas, a, b, nuevo);
  if (editado === null) return { xml, resultado: 'CRUZA_FORMATO' };
  const inicio = inicioCuerpo + parrafo.index;
  return { xml: xml.slice(0, inicio) + editado + xml.slice(inicio + parrafo[0].length), resultado: 'APLICADO' };
}

/**
 * Reemplaza TODAS las apariciones del fragmento (p. ej. un nombre que se repite en la escritura).
 * En cada párrafo se avanza de atrás hacia adelante: el texto anterior al cambio no se mueve.
 */
function reemplazarTodasEnDocumento(xml: string, original: string, nuevo: string): { xml: string; resultado: ResultadoReemplazo; veces: number } {
  const inicioCuerpo = xml.indexOf('<w:body>');
  const expresion = patronPalabra(original);
  let veces = 0;
  let cruza = 0;
  const cuerpo = xml.slice(inicioCuerpo).replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (parrafo) => {
    let limite = Infinity;
    for (;;) {
      const datos = piezas(parrafo);
      const m = [...datos.texto.matchAll(expresion)].filter((x) => x.index + x[0].length <= limite).at(-1);
      if (!m) return parrafo;
      limite = m.index;
      const editado = reemplazarEnParrafo(parrafo, datos.piezas, m.index, m.index + m[0].length, nuevo);
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
  reemplazos: { original: string; nuevo: string; todas?: boolean }[],
  aceptar: (docx: Buffer) => string | null = () => null,
): { docx: Buffer; resultados: (ResultadoReemplazo | { rechazado: string })[]; veces: number[] } {
  const zip = new PizZip(docx);
  let xml = zip.file('word/document.xml')?.asText() ?? '';
  const generar = (x: string) => { zip.file('word/document.xml', x); return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }); };
  const resultados: (ResultadoReemplazo | { rechazado: string })[] = [];
  const veces: number[] = [];
  for (const r of reemplazos) {
    veces.push(0);
    if (!r.original.trim()) { resultados.push('NO_ENCONTRADO'); continue; }
    const intento = r.todas ? reemplazarTodasEnDocumento(xml, r.original, r.nuevo) : { ...reemplazarEnDocumento(xml, r.original, r.nuevo), veces: 1 };
    if (intento.resultado !== 'APLICADO') { resultados.push(intento.resultado); continue; }
    const motivo = aceptar(generar(intento.xml));
    if (motivo) { resultados.push({ rechazado: motivo }); continue; }
    xml = intento.xml;
    resultados.push('APLICADO');
    veces[veces.length - 1] = intento.veces;
  }
  return { docx: generar(xml), resultados, veces };
}
