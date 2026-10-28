import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { normalizarSeparacion } from '@/lib/ia/documentos';
import { abrirPdf, extraerPaginas } from '@/lib/pdf';

async function pdfDe(paginas: number): Promise<Buffer> {
  const d = await PDFDocument.create();
  for (let i = 0; i < paginas; i++) d.addPage([200 + i, 300]); // ancho distinto para reconocer cada página
  return Buffer.from(await d.save());
}

describe('separación de un PDF con varios documentos', () => {
  it('ordena las partes, las ajusta al archivo y elimina superposiciones', () => {
    const partes = normalizarSeparacion({
      documentos: [
        { tipo: 'CERTIFICADO_TRADICION', pagina_inicio: 3, pagina_fin: 6, descripcion: 'Certificado 200-1' },
        { tipo: 'CEDULA', pagina_inicio: 1, pagina_fin: 3, descripcion: 'Cédulas' },
        { tipo: 'PAZ_Y_SALVO', pagina_inicio: 8, pagina_fin: 40, descripcion: 'Paz y salvo' },
        { tipo: 'INVENTADO', pagina_inicio: 50, pagina_fin: 60, descripcion: 'Fuera del archivo' },
      ],
    }, 10);
    expect(partes).toEqual([
      { tipo: 'CEDULA', desde: 1, hasta: 3, descripcion: 'Cédulas' },
      { tipo: 'CERTIFICADO_TRADICION', desde: 4, hasta: 6, descripcion: 'Certificado 200-1' },
      { tipo: 'PAZ_Y_SALVO', desde: 8, hasta: 10, descripcion: 'Paz y salvo' },
    ]);
  });

  it('un tipo desconocido queda como OTRO y una respuesta vacía no da partes', () => {
    expect(normalizarSeparacion({ documentos: [{ tipo: 'X', pagina_inicio: 1, pagina_fin: 2, descripcion: '' }] }, 2)[0].tipo).toBe('OTRO');
    expect(normalizarSeparacion({}, 5)).toEqual([]);
  });

  it('copia exactamente las páginas pedidas a un PDF nuevo', async () => {
    const pdf = (await abrirPdf(await pdfDe(6)))!;
    expect(pdf.getPageCount()).toBe(6);
    const parte = await PDFDocument.load(await extraerPaginas(pdf, 3, 5));
    expect(parte.getPages().map((p) => p.getWidth())).toEqual([202, 203, 204]);
  });

  it('un archivo que no es PDF válido no se separa', async () => {
    expect(await abrirPdf(Buffer.from('%PDF-1.4\nroto'))).toBeNull();
  });
});
