import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { aplicarCambios, documentoXml, textoDocx, faltantesEn } from '@/lib/escritura/docx';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const r = (t: string, negrilla = false) => `<w:r>${negrilla ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
const p = (...runs: string[]) => `<w:p><w:pPr><w:jc w:val="both"/></w:pPr>${runs.join('')}</w:p>`;
function docx(cuerpo: string): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${cuerpo}<w:sectPr/></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}

const PLANTILLA = docx([
  p(r('Compareció '), r('ANA RUIZ', true), r(', mayor de edad, domiciliada en la ciudad de Bogotá D.C., identificada con cédula número 1.234 expedida en Neiva.')),
  p(r('Presente, '), r('LUIS GOMEZ', true), r(', mayor de edad, domiciliado en Pitalito, Huila, quien obra en nombre del BANCO, con domicilio principal en Bogotá D.C.')),
  p(r('Compareció '), r('PEDRO PEREZ', true), r(', mayor de edad, domiciliado en «FALTA: domicilio de PEDRO PEREZ», identificado con cédula número 5.678.')),
  p(r('LOS OTORGANTES,')),
  p(r('ANA RUIZ', true)),
  p(r('Dirección y Domicilio:')),
].join(''));

describe('domicilio de los otorgantes', () => {
  const salida = aplicarCambios(PLANTILLA, []).docx;
  const texto = textoDocx(salida);
  const xml = documentoXml(salida);

  it('a todos les pone la ciudad de Neiva (H), con su género', () => {
    expect(texto).toContain('ANA RUIZ, mayor de edad, domiciliada en la ciudad de Neiva (H), identificada');
    expect(texto).toContain('LUIS GOMEZ, mayor de edad, domiciliado en la ciudad de Neiva (H), quien obra');
    expect(texto).toContain('PEDRO PEREZ, mayor de edad, domiciliado en la ciudad de Neiva (H), identificado');
    expect(faltantesEn(texto)).toEqual([]);
  });

  it('lo deja resaltado en amarillo, sin texto de marca', () => {
    expect(xml.match(/<w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve">la ciudad de Neiva \(H\)<\/w:t>/g)).toHaveLength(3);
    expect(texto).not.toContain('RESALTAR');
  });

  it('no toca el domicilio de la entidad ni la zona de firmas', () => {
    expect(texto).toContain('con domicilio principal en Bogotá D.C.');
    expect(texto).toContain('Dirección y Domicilio:');
  });
});
