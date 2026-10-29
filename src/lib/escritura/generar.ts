/**
 * Generación del borrador: reemplaza las variables de las plantillas APROBADAS y une
 * los bloques (carátula → actos → cierre y firmas → anexos) en un solo .docx.
 * La IA no interviene aquí: el texto proviene exclusivamente de las plantillas.
 *
 * Cualquier variable sin valor se imprime como «FALTA: nombre» (nunca queda vacía en
 * silencio) y el borrador se marca con observación CRÍTICA.
 */
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import expressionParser from 'docxtemplater/expressions.js';
import { filtrosConcordancia } from '../texto/concordancia';
import type { ContextoEscritura } from './contexto';
import { aplicarFormatoNotarial, aplicarMargenes, anchoTextoDe } from './formato-notarial';

const ORDINALES = ['PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO', 'SEPTIMO', 'OCTAVO', 'NOVENO', 'DECIMO',
  'DECIMO PRIMERO', 'DECIMO SEGUNDO', 'DECIMO TERCERO', 'DECIMO CUARTO', 'DECIMO QUINTO', 'DECIMO SEXTO', 'DECIMO SEPTIMO',
  'DECIMO OCTAVO', 'DECIMO NOVENO', 'VIGESIMO'];

import { MARCA_FALTANTE } from './marcas';
export { MARCA_FALTANTE };

const parser = expressionParser.configure({ filters: filtrosConcordancia });

/** Obtiene el .docx de una plantilla (aprobada) por su id */
export type CargadorPlantillas = (id: string) => Promise<Buffer>;

export interface ResultadoGeneracion {
  docx: Buffer;
  texto: string; // texto plano del borrador (para la revisión de la IA y las reglas)
  faltantes: string[];
}

/** Renderiza un bloque y devuelve el XML del cuerpo (sin la sección final) */
function renderizarBloque(plantilla: Buffer, contexto: Record<string, unknown>, faltantes: string[]): { cuerpo: string; zip: PizZip } {
  const zip = new PizZip(plantilla);
  let n = 0;
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    parser,
    nullGetter(part) {
      // Secciones ({{#x}}) sin valor: no se imprimen. Variables ({{x}}) sin valor: marca visible.
      if (part.module) return '';
      const nombre = part.value ?? '';
      if (!faltantes.includes(nombre)) faltantes.push(nombre);
      return `${MARCA_FALTANTE} ${nombre}»`;
    },
  });
  doc.render({ ...contexto, ord: () => ORDINALES[n++] ?? `CLÁUSULA ${n}` });
  const xml = doc.getZip().file('word/document.xml')!.asText();
  const inicio = xml.indexOf('<w:body>') + '<w:body>'.length;
  const finSeccion = xml.lastIndexOf('<w:sectPr');
  return { cuerpo: xml.slice(inicio, finSeccion), zip: doc.getZip() };
}

/**
 * Formato de impresión de la notaría sobre el documento completo (márgenes, guiones escritos,
 * negrillas, carátula): src/lib/escritura/formato-notarial.ts. El texto para las reglas y la IA
 * se toma antes, sin los guiones.
 */
function formatoImpresion(xml: string): string {
  const conMargenes = aplicarMargenes(xml);
  const inicio = conMargenes.indexOf('<w:body>') + '<w:body>'.length;
  const finSeccion = conMargenes.lastIndexOf('<w:sectPr');
  return conMargenes.slice(0, inicio) + aplicarFormatoNotarial(conMargenes.slice(inicio, finSeccion), anchoTextoDe(conMargenes)) + conMargenes.slice(finSeccion);
}

/** Renderiza una sola plantilla con un contexto (prueba con datos de ejemplo en el panel de plantillas) */
export function renderizarPlantilla(plantilla: Buffer, contexto: Record<string, unknown>): { docx: Buffer; faltantes: string[] } {
  const faltantes: string[] = [];
  const { zip } = renderizarBloque(plantilla, contexto, faltantes);
  zip.file('word/document.xml', formatoImpresion(zip.file('word/document.xml')!.asText()));
  return { docx: zip.generate({ type: 'nodebuffer' }) as Buffer, faltantes };
}

const textoPlano = (xml: string) => xml
  .replace(/<w:tab\/>/g, ' ').replace(/<\/w:p>/g, '\n').replace(/<w:br[^>]*\/>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/\n{3,}/g, '\n\n').trim();

export async function generarBorrador(ctx: ContextoEscritura, cargar: CargadorPlantillas): Promise<ResultadoGeneracion> {
  const faltantes: string[] = [];
  // Si todos los actos son por plantilla, cada plantilla es la escritura completa: sin carátula ni cierre comunes
  const caratula = ctx.conCaratula === false ? null : renderizarBloque(await cargar('caratula'), ctx.global, faltantes);
  const cuerpos = caratula ? [caratula.cuerpo] : [];
  let primero: PizZip | null = null;
  for (const acto of ctx.actos) {
    const r = renderizarBloque(await cargar(acto.plantilla), acto.contexto, faltantes);
    primero ??= r.zip;
    cuerpos.push(r.cuerpo);
  }
  if (caratula) {
    cuerpos.push(renderizarBloque(await cargar('cierre'), ctx.global, faltantes).cuerpo);
    const anexos = [...new Set(ctx.actos.map((a) => a.anexo).filter((x): x is string => !!x))];
    for (const anexo of anexos) cuerpos.push(renderizarBloque(await cargar(anexo), ctx.global, faltantes).cuerpo);
  }

  // Se usa el paquete de la carátula (estilos, encabezado "Hoja No.", página) como base; sin ella, el del primer acto
  const zip = caratula?.zip ?? primero!;
  const xml = zip.file('word/document.xml')!.asText();
  const inicio = xml.indexOf('<w:body>') + '<w:body>'.length;
  const finSeccion = xml.lastIndexOf('<w:sectPr');
  const unido = formatoImpresion(xml.slice(0, inicio) + cuerpos.join('') + xml.slice(finSeccion));
  zip.file('word/document.xml', unido);
  const docx = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
  return { docx, texto: textoPlano(cuerpos.join('')), faltantes };
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
