import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import { reemplazarEnDocx } from '@/lib/escritura/editar-docx';
import { vistaPreviaDocx, textoDeParrafos } from '@/lib/escritura/vista-previa';

const raiz = path.resolve(__dirname, '..');

/** .docx mínimo con el cuerpo dado */
function docxCon(cuerpo: string): Buffer {
  const zip = new PizZip(fs.readFileSync(path.join(raiz, 'plantillas', 'docx', 'cierre.docx')));
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}<w:sectPr/></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}
const texto = (d: Buffer) => textoDeParrafos(vistaPreviaDocx(d));
const xml = (d: Buffer) => new PizZip(d).file('word/document.xml')!.asText();
const r = (t: string, rPr = '') => `<w:r>${rPr}<w:t xml:space="preserve">${t}</w:t></w:r>`;
const NEGRITA = '<w:rPr><w:b/></w:rPr>';

describe('reemplazarEnDocx', () => {
  it('reemplaza un fragmento partido en varias corridas y conserva el formato de las demás', () => {
    const d = docxCon(`<w:p>${r('El ')}${r('comprador', NEGRITA)}${r(' declara que recibe')}${r(' el inmueble.')}</w:p>`);
    const s = reemplazarEnDocx(d, [{ original: 'comprador declara que recibe', nuevo: 'comprador manifiesta que recibe' }]);
    expect(s.resultados).toEqual(['APLICADO']);
    expect(texto(s.docx)).toBe('El comprador manifiesta que recibe el inmueble.');
    // El texto nuevo queda en la primera corrida tocada (negrita); las otras conservan el suyo
    const p = vistaPreviaDocx(s.docx)[0].segmentos;
    expect(p.find((x) => x.negrita)?.texto).toBe('comprador manifiesta que recibe');
    expect(p.at(-1)).toMatchObject({ texto: ' el inmueble.', negrita: false });
  });

  it('tolera diferencias de espacios y escapa los caracteres especiales del XML', () => {
    const d = docxCon(`<w:p>${r('Valor:  &lt;precio&gt;')}</w:p>`);
    const s = reemplazarEnDocx(d, [{ original: 'Valor: <precio>', nuevo: 'Valor & precio <total>' }]);
    expect(s.resultados).toEqual(['APLICADO']);
    expect(texto(s.docx)).toBe('Valor & precio <total>');
    expect(xml(s.docx)).toContain('Valor &amp; precio &lt;total&gt;');
  });

  it('no reemplaza si el fragmento no existe, aparece varias veces o cruza una tabulación', () => {
    const d = docxCon(`<w:p>${r('SEGUNDO: ')}<w:r><w:tab/></w:r>${r('texto')}</w:p><w:p>${r('repetido')}</w:p><w:p>${r('repetido')}</w:p>`);
    const s = reemplazarEnDocx(d, [
      { original: 'no está', nuevo: 'x' },
      { original: 'repetido', nuevo: 'x' },
      { original: 'SEGUNDO: \ttexto', nuevo: 'SEGUNDO: texto' },
    ]);
    expect(s.resultados).toEqual(['NO_ENCONTRADO', 'AMBIGUO', 'CRUZA_FORMATO']);
    expect(xml(s.docx)).toBe(xml(d));
  });

  it('deshace el reemplazo que el validador rechaza y sigue con los demás', () => {
    const d = docxCon(`<w:p>${r('Señor {{a.vendedor.nombre}} y la compradora.')}</w:p>`);
    const s = reemplazarEnDocx(d, [
      { original: '{{a.vendedor.nombre}}', nuevo: '{{a.vendedor.nombre}' },
      { original: 'la compradora', nuevo: 'el comprador' },
    ], (doc) => (/{{[^{}]*}(?!})/.test(texto(doc)) ? 'etiqueta sin cerrar' : null));
    expect(s.resultados[0]).toHaveProperty('rechazado');
    expect(s.resultados[1]).toBe('APLICADO');
    expect(texto(s.docx)).toBe('Señor {{a.vendedor.nombre}} y el comprador.');
  });

  it('con «todas» reemplaza cada aparición, también varias en un mismo párrafo y partidas entre corridas', () => {
    const d = docxCon(`<w:p>${r('ANA ROJAS, mayor, y ')}${r('ANA ', NEGRITA)}${r('ROJAS firma.')}</w:p><w:p>${r('Vende ANA ROJAS.')}</w:p>`);
    const s = reemplazarEnDocx(d, [{ original: 'ANA ROJAS', nuevo: '{{a.vendedor.nombre}}', todas: true }]);
    expect(s.resultados).toEqual(['APLICADO']);
    expect(s.veces).toEqual([3]);
    expect(texto(s.docx)).toBe('{{a.vendedor.nombre}}, mayor, y {{a.vendedor.nombre}} firma.\nVende {{a.vendedor.nombre}}.');
  });

  it('con «todas» no toma el fragmento dentro de una palabra o número más largo', () => {
    const d = docxCon(`<w:p>${r('ANA ANALIZA el folio 200-123 y el 200-1234.')}</w:p>`);
    const s = reemplazarEnDocx(d, [
      { original: 'ANA', nuevo: '{{nombre}}', todas: true },
      { original: '200-123', nuevo: '{{matricula}}', todas: true },
    ]);
    expect(s.veces).toEqual([1, 1]);
    expect(texto(s.docx)).toBe('{{nombre}} ANALIZA el folio {{matricula}} y el 200-1234.');
  });
});
