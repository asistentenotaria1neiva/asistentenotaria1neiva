/**
 * Armado del Word de la escritura a partir del texto que redactó la IA (src/lib/servicios/redaccion.ts)
 * tomando como base las plantillas APROBADAS. Del paquete .docx de la plantilla base se conservan los
 * estilos, el encabezado («Hoja No.») y la sección; el cuerpo se reemplaza por los párrafos redactados.
 *
 * Después se aplica el formato de impresión de la notaría (Resolución 9146 de 2012: márgenes, Arial 12,
 * interlineado 1,5, justificado, sin renglones en blanco, guiones de relleno y negrillas):
 * src/lib/escritura/formato-notarial.ts.
 *
 * Un dato que la IA no encontró queda escrito como «FALTA: …» (nunca en blanco en silencio) y uno
 * dudoso como «[VERIFICAR: …]». Ambos van con resaltado amarillo en el Word para encontrarlos
 * rápido (lo que falta, además en negrilla).
 */
import PizZip from 'pizzip';
import { aplicarAjustesNotariales, aplicarEstilosNotariales, aplicarFormatoNotarial, aplicarMargenes, anchoTextoDe } from './formato-notarial';
import { MARCA_FALTANTE } from './marcas';
export { MARCA_FALTANTE };

export type Alineacion = 'JUSTIFICADO' | 'CENTRADO' | 'IZQUIERDA' | 'DERECHA';
/** Un párrafo redactado. En el texto, **así** va en negrilla explícita; «\n» es un salto de línea. */
export interface ParrafoRedactado { texto: string; alineacion: Alineacion }

export interface ResultadoGeneracion {
  docx: Buffer;
  texto: string; // texto plano de la escritura (para las reglas y la revisión de la IA)
  faltantes: string[];
  /** Puntos marcados «[VERIFICAR: …]» en el texto */
  verificar: string[];
}

const JC: Record<Alineacion, string> = { JUSTIFICADO: 'both', CENTRADO: 'center', IZQUIERDA: 'left', DERECHA: 'right' };
const codificar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Caracteres que Word no admite en el XML (controles distintos de tabulación y salto)
const limpiar = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\r\n?/g, '\n');

/** Resaltado de Word de las marcas «FALTA: …» y [VERIFICAR: …] */
export const RESALTADO = 'yellow';
const MARCAS = /(«FALTA:[^»]*»|\[VERIFICAR:[^\]]*\])/;

function run(texto: string, negrita: boolean, resaltar = false): string {
  const props = `${negrita ? '<w:b/><w:bCs/>' : ''}${resaltar ? `<w:highlight w:val="${RESALTADO}"/>` : ''}`;
  const rPr = props ? `<w:rPr>${props}</w:rPr>` : '';
  const partes = texto.split(/(\n|\t)/).map((t) => (t === '\n' ? '<w:br/>' : t === '\t' ? '<w:tab/>' : t ? `<w:t xml:space="preserve">${codificar(t)}</w:t>` : '')).join('');
  return partes ? `<w:r>${rPr}${partes}</w:r>` : '';
}

/** XML de un párrafo redactado */
export function parrafoXml(p: ParrafoRedactado): string {
  const texto = limpiar(p.texto ?? '');
  // Negrilla explícita (**…**) y, dentro, las marcas resaltadas en amarillo (lo que falta, además en negrilla)
  const runs = texto.split(/\*\*/).flatMap((t, i) => t.split(MARCAS).map((x) => {
    const falta = x.startsWith('«FALTA:');
    return run(x, i % 2 === 1 || falta, falta || x.startsWith('[VERIFICAR:'));
  })).join('');
  return `<w:p><w:pPr><w:jc w:val="${JC[p.alineacion] ?? 'both'}"/></w:pPr>${runs}</w:p>`;
}

/**
 * Formato de impresión de la notaría sobre el documento completo (márgenes, guiones escritos,
 * negrillas, carátula).
 */
function formatoImpresion(xml: string): string {
  const conMargenes = aplicarMargenes(xml);
  const inicio = conMargenes.indexOf('<w:body>') + '<w:body>'.length;
  const finSeccion = conMargenes.lastIndexOf('<w:sectPr');
  return conMargenes.slice(0, inicio) + aplicarFormatoNotarial(conMargenes.slice(inicio, finSeccion), anchoTextoDe(conMargenes)) + conMargenes.slice(finSeccion);
}

/** Resolución 9146 de 2012 en el paquete: estilos en Arial 12 y márgenes simétricos */
function formatoPaquete(zip: PizZip): void {
  const estilos = zip.file('word/styles.xml');
  if (estilos) zip.file('word/styles.xml', aplicarEstilosNotariales(estilos.asText()));
  const ajustes = zip.file('word/settings.xml');
  if (ajustes) zip.file('word/settings.xml', aplicarAjustesNotariales(ajustes.asText()));
}

export const textoPlano = (parrafos: ParrafoRedactado[]) => parrafos.map((p) => limpiar(p.texto ?? '').replace(/\*\*/g, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();

/** Puntos marcados [VERIFICAR: …] en el texto */
export const verificarEn = (texto: string) => [...new Set([...texto.matchAll(/\[VERIFICAR:\s*([^\]]*)\]/g)].map((m) => m[1].trim()).filter(Boolean))];

/** Datos marcados «FALTA: …» en el texto */
export const faltantesEn = (texto: string) => [...new Set([...texto.matchAll(new RegExp(`${MARCA_FALTANTE}\\s*([^»]*)»`, 'g'))].map((m) => m[1].trim()).filter(Boolean))];

/** Arma el .docx de la escritura: el paquete de `base` (plantilla aprobada) con los párrafos redactados */
export function armarEscritura(base: Buffer, parrafos: ParrafoRedactado[]): ResultadoGeneracion {
  const zip = new PizZip(base);
  const xml = zip.file('word/document.xml')?.asText();
  if (!xml || !xml.includes('<w:body>')) throw new Error('La plantilla base no tiene documento principal.');
  const inicio = xml.indexOf('<w:body>') + '<w:body>'.length;
  let finSeccion = xml.lastIndexOf('<w:sectPr');
  if (finSeccion < inicio) finSeccion = xml.lastIndexOf('</w:body>');
  const cuerpo = parrafos.map(parrafoXml).join('');
  zip.file('word/document.xml', formatoImpresion(xml.slice(0, inicio) + cuerpo + xml.slice(finSeccion)));
  formatoPaquete(zip);
  const texto = textoPlano(parrafos);
  return { docx: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer, texto, faltantes: faltantesEn(texto), verificar: verificarEn(texto) };
}

/**
 * Convierte el .docx a PDF con un servicio Gotenberg (LibreOffice) externo, si PDF_CONVERSOR_URL está definida.
 * Devuelve null si no hay conversor configurado.
 */
export async function convertirAPdf(docx: Buffer, nombre = 'borrador.docx'): Promise<Buffer | null> {
  const url = process.env.PDF_CONVERSOR_URL;
  if (!url) return null;
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(docx)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), nombre);
  const r = await fetch(`${url.replace(/\/$/, '')}/forms/libreoffice/convert`, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`El conversor PDF respondió ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
