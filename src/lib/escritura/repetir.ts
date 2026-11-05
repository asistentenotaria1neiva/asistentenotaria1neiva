/**
 * Varias personas con el mismo papel en una plantilla hecha para una sola. La plantilla se armó
 * con un caso real (un usufructuario: {{nombre_usufructuario}}, {{cedula_usufructuario}}…) y el
 * caso de hoy puede traer dos o más. Antes de llenar la plantilla, el texto de esa persona se
 * envuelve en una repetición de docxtemplater, para que salga una vez por cada una:
 *   - dentro de un párrafo, el tramo que va de su primer dato al último («MARIA…, identificada con
 *     la cédula… expedida en…») se repite separado por «, » y « y »:
 *       {{#__g_usufructuario}}{{__sep}}{{nombre_usufructuario}}, identificada … {{/__g_usufructuario}}
 *   - los párrafos cortos que solo traen sus datos (el bloque de la firma: la línea, el nombre, la
 *     cédula) se repiten completos, uno debajo del otro.
 * Cada elemento de la lista trae los valores de una persona con los nombres de las variables de la
 * plantilla (src/lib/escritura/actos-plantilla.ts), así que el resto del texto no cambia.
 */
import PizZip from 'pizzip';

export interface GrupoRepetido { grupo: string; variables: string[] }

/** Un tramo de un mismo párrafo más largo que esto no es «los datos de la persona»: son dos menciones distintas */
const MAX_TRAMO = 260;
/** Párrafo de firma o de lista: sin las variables, le queda menos texto que esto */
const MAX_PARRAFO_CORTO = 40;

interface Caracter { xi: number; xf: number }
interface Parrafo { inicio: number; fin: number; texto: string; pos: Caracter[] }

const ENTIDADES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

/** Texto del párrafo y, para cada carácter, dónde está en el XML */
function leerParrafo(xml: string, inicio: number, fin: number): Parrafo {
  const px = xml.slice(inicio, fin);
  let texto = '';
  const pos: Caracter[] = [];
  for (const m of px.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)) {
    const base = inicio + m.index! + m[0].indexOf('>') + 1;
    const raw = m[1];
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '&') {
        const j = raw.indexOf(';', i);
        if (j > i) { texto += ENTIDADES[raw.slice(i, j + 1)] ?? '?'; pos.push({ xi: base + i, xf: base + j + 1 }); i = j; continue; }
      }
      texto += raw[i];
      pos.push({ xi: base + i, xf: base + i + 1 });
    }
  }
  return { inicio, fin, texto, pos };
}

interface Aparicion { grupo: string; ini: number; fin: number }

/** Las variables de los grupos y los límites de bloque ({{#x}}, {{/x}}) de un párrafo */
function etiquetas(p: Parrafo, grupoDe: Map<string, string>) {
  const apariciones: Aparicion[] = [];
  const limites: number[] = [];
  for (const m of p.texto.matchAll(/\{\{\s*([#^/]?)\s*([^{}]+?)\s*\}\}/g)) {
    const id = m[2].split('|')[0].trim();
    if (m[1]) { limites.push(m.index!); continue; }
    const g = grupoDe.get(id);
    if (g) apariciones.push({ grupo: g, ini: m.index!, fin: m.index! + m[0].length });
  }
  return { apariciones, limites };
}

const sinEtiquetas = (t: string) => t.replace(/\{\{[^{}]*\}\}/g, '').trim();
const esLineaVacia = (t: string) => /^[\s_.\-–]*$/.test(t);

/**
 * Envuelve en repeticiones el texto de las personas de cada grupo. `xml` es word/document.xml.
 * Si un tramo se cruza con otro (o con un bloque condicional), se deja como está.
 */
export function repetirEnXml(xml: string, grupos: GrupoRepetido[]): string {
  if (!grupos.length) return xml;
  const grupoDe = new Map(grupos.flatMap((g) => g.variables.map((v) => [v, g.grupo] as const)));
  const parrafos: Parrafo[] = [];
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) parrafos.push(leerParrafo(xml, m.index!, m.index! + m[0].length));
  const cambios: { en: number; texto: string }[] = [];
  const info = parrafos.map((p) => etiquetas(p, grupoDe));

  // 1. Bloques de párrafos cortos (firmas, listas): se repiten los párrafos completos
  const enBloque = new Set<number>();
  const corto = (i: number) => {
    const { apariciones, limites } = info[i];
    if (!apariciones.length || limites.length || new Set(apariciones.map((a) => a.grupo)).size > 1) return null;
    // Solo rótulos («C.C.», «Estado civil:», «Huella»): una frase que termina en punto es del cuerpo de la escritura
    const resto = sinEtiquetas(parrafos[i].texto);
    return resto.length <= MAX_PARRAFO_CORTO && !/[a-záéíóúñ]{3,}\.\s*$/i.test(resto) ? apariciones[0].grupo : null;
  };
  const contiguos = (a: number, b: number) => !xml.slice(parrafos[a].fin, parrafos[b].inicio).trim();
  for (let i = 0; i < parrafos.length; i++) {
    const g = corto(i);
    if (!g || enBloque.has(i)) continue;
    let ini = i, fin = i;
    // Hacia abajo: más párrafos cortos del mismo grupo, con líneas vacías o de firma entre ellos
    for (let j = i + 1; j < parrafos.length && contiguos(j - 1, j); j++) {
      if (corto(j) === g) fin = j;
      else if (!(esLineaVacia(parrafos[j].texto) && !info[j].apariciones.length)) break;
    }
    // Hacia arriba: la línea de la firma y un renglón vacío antes de ella
    for (let j = ini - 1; j >= 0 && ini - j <= 2 && contiguos(j, j + 1) && esLineaVacia(parrafos[j].texto) && !info[j].apariciones.length && !enBloque.has(j); j--) ini = j;
    for (let k = ini; k <= fin; k++) enBloque.add(k);
    cambios.push({ en: parrafos[ini].inicio, texto: `<w:p><w:r><w:t>{{#${g}}}</w:t></w:r></w:p>` });
    cambios.push({ en: parrafos[fin].fin, texto: `<w:p><w:r><w:t>{{/${g}}}</w:t></w:r></w:p>` });
  }

  // 2. Dentro de los demás párrafos: el tramo de cada persona, separado por comas y «y»
  parrafos.forEach((p, i) => {
    if (enBloque.has(i)) return;
    const { apariciones, limites } = info[i];
    const tramos: Aparicion[] = [];
    for (const a of apariciones) {
      const ultimo = [...tramos].reverse().find((t) => t.grupo === a.grupo);
      const corta = !ultimo || a.ini - ultimo.fin > MAX_TRAMO || limites.some((l) => l > ultimo.fin && l < a.ini);
      if (corta) tramos.push({ ...a });
      else ultimo.fin = a.fin;
    }
    // Tramos de grupos distintos que se cruzan: no se puede repetir uno sin el otro
    const validos = tramos.filter((t) => !tramos.some((o) => o !== t && o.ini < t.fin && t.ini < o.fin));
    for (const t of validos) {
      cambios.push({ en: p.pos[t.ini].xi, texto: `{{#${t.grupo}}}{{__sep}}` });
      cambios.push({ en: p.pos[t.fin - 1].xf, texto: `{{/${t.grupo}}}` });
    }
  });

  // Del final al comienzo, para que las posiciones sigan valiendo; en la misma posición, el cierre
  // de un bloque queda antes de la apertura del siguiente (se aplica primero lo que se agregó después)
  let r = xml;
  const orden = cambios.map((c, i) => ({ ...c, i })).sort((a, b) => b.en - a.en || b.i - a.i);
  for (const c of orden) r = r.slice(0, c.en) + c.texto + r.slice(c.en);
  return r;
}

/** Lo mismo sobre el .docx de la plantilla */
export function repetirEnPlantilla(docx: Buffer, grupos: GrupoRepetido[]): Buffer {
  if (!grupos.length) return docx;
  const zip = new PizZip(docx);
  const f = zip.file('word/document.xml');
  if (!f) return docx;
  zip.file('word/document.xml', repetirEnXml(f.asText(), grupos));
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}
