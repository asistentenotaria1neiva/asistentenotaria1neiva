/**
 * Páginas de un PDF: contarlas y copiar un rango a un PDF nuevo (para separar un archivo que trae
 * varios documentos escaneados juntos).
 */
import { PDFDocument } from 'pdf-lib';

/** El PDF listo para separar, o null si no se puede (dañado, sin páginas legibles o cifrado con contraseña) */
export async function abrirPdf(bytes: Buffer): Promise<PDFDocument | null> {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return pdf.isEncrypted || !pdf.getPageCount() ? null : pdf;
  } catch {
    return null;
  }
}

/** PDF nuevo con las páginas desde..hasta (1 = primera, ambas incluidas) */
export async function extraerPaginas(origen: PDFDocument, desde: number, hasta: number): Promise<Buffer> {
  const nuevo = await PDFDocument.create();
  const paginas = await nuevo.copyPages(origen, Array.from({ length: hasta - desde + 1 }, (_, i) => desde - 1 + i));
  for (const p of paginas) nuevo.addPage(p);
  return Buffer.from(await nuevo.save());
}
