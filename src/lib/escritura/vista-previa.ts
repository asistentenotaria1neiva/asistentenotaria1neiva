/**
 * Vista previa de una plantilla .docx en pantalla (sin Word): párrafos con su alineación,
 * negrillas, cursivas y subrayados, y con las variables {{…}} y los bloques condicionales
 * señalados. También sirve para el borrador de ejemplo, donde se señalan las marcas «FALTA: …».
 *
 * Es una lectura aproximada del documento (no reproduce márgenes, tablas ni encabezados):
 * para revisar el formato exacto se descarga el .docx.
 */
import PizZip from 'pizzip';
import { MARCA_FALTANTE } from './marcas';

export type ClaseSegmento = 'texto' | 'variable' | 'condicion' | 'cierre' | 'faltante';

export interface Segmento { texto: string; negrita?: boolean; cursiva?: boolean; subrayado?: boolean; clase: ClaseSegmento }
export interface Parrafo { alineacion: 'izquierda' | 'centro' | 'derecha' | 'justificado'; segmentos: Segmento[] }

const entidades = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Una propiedad booleana de Word (<w:b/>, <w:b w:val="0"/>…) está activa si no se apaga explícitamente */
const activa = (rPr: string, etiqueta: string) => {
  const m = rPr.match(new RegExp(`<w:${etiqueta}(?:\\s+w:val="([^"]*)")?\\s*/>`));
  return !!m && !['0', 'false', 'none'].includes(m[1] ?? '');
};

const ALINEACION: Record<string, Parrafo['alineacion']> = { center: 'centro', right: 'derecha', end: 'derecha', both: 'justificado', distribute: 'justificado' };

/** Etiqueta → clase: {{#x}} / {{^x}} abren condición, {{/x}} la cierra, el resto son variables */
function claseEtiqueta(etiqueta: string): ClaseSegmento {
  const c = etiqueta.replace(/^\{\{\s*/, '')[0];
  return c === '#' || c === '^' ? 'condicion' : c === '/' ? 'cierre' : 'variable';
}

/** Rangos [inicio, fin, clase] de las partes especiales del texto de un párrafo */
function rangosEspeciales(texto: string, marcarFaltantes: boolean): [number, number, ClaseSegmento][] {
  const rangos: [number, number, ClaseSegmento][] = [];
  for (const m of texto.matchAll(/\{\{[\s\S]*?\}\}/g)) rangos.push([m.index, m.index + m[0].length, claseEtiqueta(m[0])]);
  if (marcarFaltantes) {
    for (const m of texto.matchAll(new RegExp(`${MARCA_FALTANTE}[^»]*»`, 'g'))) rangos.push([m.index, m.index + m[0].length, 'faltante']);
  }
  return rangos.sort((a, b) => a[0] - b[0]);
}

function leerParrafo(xml: string, marcarFaltantes: boolean): Parrafo {
  const jc = xml.match(/<w:pPr>[\s\S]*?<w:jc\s+w:val="([^"]+)"/)?.[1];
  const corridas: Omit<Segmento, 'clase'>[] = [];
  for (const r of xml.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)) {
    const rPr = r[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
    const formato = { negrita: activa(rPr, 'b'), cursiva: activa(rPr, 'i'), subrayado: /<w:u\s+w:val="(?!none)/.test(rPr) };
    let texto = '';
    for (const t of r[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t\/>|<w:(tab)\/>|<w:(br|cr)\b[^>]*\/>/g)) {
      texto += t[1] !== undefined ? entidades(t[1]) : t[2] ? '\t' : t[3] ? '\n' : '';
    }
    if (texto) corridas.push({ texto, ...formato });
  }

  // Las variables pueden quedar partidas entre corridas: se ubican sobre el texto completo
  // y luego se recorta cada corrida en los bordes de cada variable.
  const completo = corridas.map((c) => c.texto).join('');
  const rangos = rangosEspeciales(completo, marcarFaltantes);
  const claseEn = (i: number): ClaseSegmento => rangos.find(([a, b]) => i >= a && i < b)?.[2] ?? 'texto';
  const segmentos: Segmento[] = [];
  let pos = 0;
  for (const c of corridas) {
    let inicio = 0;
    for (let i = 1; i <= c.texto.length; i++) {
      if (i === c.texto.length || claseEn(pos + i) !== claseEn(pos + inicio)) {
        const s: Segmento = { ...c, texto: c.texto.slice(inicio, i), clase: claseEn(pos + inicio) };
        const previo = segmentos.at(-1);
        // Une segmentos contiguos con el mismo formato y clase (Word parte el texto en muchas corridas)
        if (previo && previo.clase === s.clase && previo.negrita === s.negrita && previo.cursiva === s.cursiva && previo.subrayado === s.subrayado) previo.texto += s.texto;
        else segmentos.push(s);
        inicio = i;
      }
    }
    pos += c.texto.length;
  }
  return { alineacion: ALINEACION[jc ?? ''] ?? 'izquierda', segmentos };
}

/** Lee el documento principal de un .docx y lo devuelve como párrafos con formato */
export function vistaPreviaDocx(docx: Buffer, opciones: { marcarFaltantes?: boolean } = {}): Parrafo[] {
  const xml = new PizZip(docx).file('word/document.xml')?.asText() ?? '';
  const cuerpo = xml.slice(xml.indexOf('<w:body>'), xml.lastIndexOf('</w:body>'));
  return [...cuerpo.matchAll(/<w:p\/>|<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => leerParrafo(m[0], !!opciones.marcarFaltantes));
}

/** Texto plano de los párrafos (para la revisión de la IA) */
export const textoDeParrafos = (parrafos: Parrafo[]) => parrafos.map((p) => p.segmentos.map((s) => s.texto).join('')).join('\n').replace(/\n{3,}/g, '\n\n').trim();

export interface EtiquetasPlantilla { variables: string[]; condiciones: string[] }

/** Variables y condiciones distintas que usa la plantilla (normalizadas sin espacios sobrantes) */
export function etiquetasDe(parrafos: Parrafo[]): EtiquetasPlantilla {
  const variables = new Set<string>();
  const condiciones = new Set<string>();
  for (const m of textoDeParrafos(parrafos).matchAll(/\{\{\s*([#^/]?)\s*([\s\S]*?)\s*\}\}/g)) {
    const nombre = m[2].replace(/\s+/g, ' ');
    if (m[1] === '#' || m[1] === '^') condiciones.add(nombre);
    else if (!m[1]) variables.add(nombre);
  }
  return { variables: [...variables].sort(), condiciones: [...condiciones].sort() };
}
