import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PizZip from 'pizzip';
import { vistaPreviaDocx, textoDeParrafos, etiquetasDe } from '@/lib/escritura/vista-previa';
import { prepararContexto } from '@/lib/escritura/contexto';
import { renderizarPlantilla, MARCA_FALTANTE } from '@/lib/escritura/generar';
import type { DatosExpediente } from '@/lib/escritura/tipos';

const raiz = path.resolve(__dirname, '..');
const docx = (id: string) => fs.readFileSync(path.join(raiz, 'plantillas', 'docx', `${id}.docx`));
const casos = JSON.parse(fs.readFileSync(path.join(raiz, 'datos_prueba', 'casos.json'), 'utf8')).casos as
  { clave: string; actos: string[]; datos: DatosExpediente }[];

/** .docx mínimo con el cuerpo dado */
function docxCon(cuerpo: string): Buffer {
  const zip = new PizZip(docx('cierre'));
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}<w:sectPr/></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}

describe('vista previa de plantillas', () => {
  it.each(fs.readdirSync(path.join(raiz, 'plantillas', 'docx')).map((f) => f.replace('.docx', '')))('%s se lee con sus variables', (id) => {
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

  it('el ejemplo llenado no deja etiquetas y marca los faltantes', () => {
    const caso = casos.find((c) => c.clave === 'compraventa_simple')!;
    const ctx = prepararContexto(caso.datos, caso.actos);
    const r = renderizarPlantilla(docx('compraventa'), ctx.actos[0].contexto);
    expect(r.faltantes).toEqual([]);
    expect(textoDeParrafos(vistaPreviaDocx(r.docx))).not.toMatch(/\{\{/);

    const conFaltante = renderizarPlantilla(docxCon('<w:p><w:r><w:t>Dato: {{a.no_existe}}</w:t></w:r></w:p>'), {});
    expect(conFaltante.faltantes).toEqual(['a.no_existe']);
    const [p] = vistaPreviaDocx(conFaltante.docx, { marcarFaltantes: true });
    expect(p.segmentos.at(-1)).toMatchObject({ clase: 'faltante', texto: `${MARCA_FALTANTE} a.no_existe»` });
  });
});
