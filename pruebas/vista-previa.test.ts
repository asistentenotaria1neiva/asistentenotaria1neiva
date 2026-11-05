import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import { vistaPreviaDocx, textoDeParrafos, etiquetasDe } from '@/lib/escritura/vista-previa';
import { MARCA_FALTANTE } from '@/lib/escritura/generar';

const raiz = path.resolve(__dirname, '..');
const docx = (id: string) => fs.readFileSync(path.join(raiz, 'plantillas', 'docx', `${id}.docx`));

/** .docx mínimo con el cuerpo dado */
function docxCon(cuerpo: string): Buffer {
  const zip = new PizZip(docx('cierre'));
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}<w:sectPr/></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}

describe('vista previa de plantillas', () => {
  it.each(fs.readdirSync(path.join(raiz, 'plantillas', 'docx')).map((f) => f.replace('.docx', '')))('%s se lee (las plantillas de la compraventa conservan sus etiquetas como guía)', (id) => {
    const parrafos = vistaPreviaDocx(docx(id));
    expect(parrafos.length).toBeGreaterThan(0);
    const e = etiquetasDe(parrafos);
    expect(e.variables.length).toBeGreaterThan(0);
    // Cada etiqueta queda resaltada completa en un solo segmento
    const resaltadas = parrafos.flatMap((p) => p.segmentos.filter((s) => s.clase !== 'texto'));
    for (const s of resaltadas) expect(s.texto).toMatch(/^\{\{[\s\S]*\}\}$/);
  });

  it('une una variable partida entre corridas y conserva el formato', () => {
    const [p] = vistaPreviaDocx(docxCon('<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">VENDE: {{a.ven</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>dedor}}</w:t></w:r><w:r><w:t xml:space="preserve"> y {{#x}}sí{{/x}}</w:t></w:r></w:p>'));
    expect(p.alineacion).toBe('justificado');
    expect(p.segmentos).toEqual([
      { texto: 'VENDE: ', negrita: true, cursiva: false, subrayado: false, clase: 'texto' },
      { texto: '{{a.vendedor}}', negrita: true, cursiva: false, subrayado: false, clase: 'variable' },
      { texto: ' y ', negrita: false, cursiva: false, subrayado: false, clase: 'texto' },
      { texto: '{{#x}}', negrita: false, cursiva: false, subrayado: false, clase: 'condicion' },
      { texto: 'sí', negrita: false, cursiva: false, subrayado: false, clase: 'texto' },
      { texto: '{{/x}}', negrita: false, cursiva: false, subrayado: false, clase: 'cierre' },
    ]);
    expect(etiquetasDe([p])).toEqual({ variables: ['a.vendedor'], condiciones: ['x'] });
  });

  it('marca los datos faltantes del borrador', () => {
    const [p] = vistaPreviaDocx(docxCon('<w:p><w:r><w:t>Dato: «FALTA: precio» fin</w:t></w:r></w:p>'), { marcarFaltantes: true });
    expect(p.segmentos.find((s) => s.clase === 'faltante')).toMatchObject({ clase: 'faltante', texto: `${MARCA_FALTANTE} precio»` });
  });
});
