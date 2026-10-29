import { describe, expect, it } from 'vitest';
import { aplicarFormatoNotarial, aplicarMargenes, guionesDeRelleno, tramosNegrilla, MARGENES_NOTARIA } from '@/lib/escritura/formato-notarial';

const ANCHO = 12240 - MARGENES_NOTARIA.izq - MARGENES_NOTARIA.der;
/** Ancho del renglón en milésimas de em de Arial 12 */
const RENGLON = ANCHO / 20 * 1000 / 12;
const conGuia = (texto: string) => `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="hyphen" w:pos="8894"/></w:tabs><w:jc w:val="both"/></w:pPr><w:r><w:t xml:space="preserve">${texto}</w:t></w:r><w:r><w:tab/></w:r></w:p>`;
const sinGuia = (texto: string) => `<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t xml:space="preserve">${texto}</w:t></w:r></w:p>`;
const textos = (xml: string) => (xml.match(/<w:p[ >].*?<\/w:p>/gs) ?? []).map((p) => p.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, ''));
const negrillas = (xml: string) => (xml.match(/<w:r><w:rPr><w:b\/>.*?<\/w:r>/gs) ?? []).map((r) => r.replace(/<[^>]+>/g, ''));

describe('formato de impresión de la notaría', () => {
  it('completa el último renglón con guiones escritos, sin pasarse al siguiente', () => {
    const [p] = textos(aplicarFormatoNotarial(conGuia('MATRICULA INMOBILIARIA: 200-301776.'), ANCHO));
    expect(p).toMatch(/^MATRICULA INMOBILIARIA: 200-301776\. -{40,}$/);
    // Un renglón lleno: los guiones no caben y no se agregan
    const lleno = 'a'.repeat(Math.floor(RENGLON / 556));
    expect(guionesDeRelleno([{ texto: lleno, negrilla: false }], RENGLON)).toBe(0);
  });

  it('quita la tabulación de relleno (Google Docs no la muestra) y respeta los párrafos sin relleno', () => {
    const xml = aplicarFormatoNotarial(conGuia('Texto de la cláusula.') + sinGuia('LOS OTORGANTES,'), ANCHO);
    expect(xml).not.toContain('w:leader="hyphen"');
    expect(xml).not.toContain('<w:tab/>');
    expect(textos(xml)[1]).toBe('LOS OTORGANTES,');
  });

  it('pone una línea de guiones antes de cada cláusula', () => {
    const t = textos(aplicarFormatoNotarial(conGuia('PRIMERO: Que transfiere.') + conGuia('SEGUNDO. TRADICIÓN: Que lo adquirió.'), ANCHO));
    expect(t[1]).toMatch(/^-{100,}$/);
    expect(t[2]).toMatch(/^SEGUNDO\. TRADICIÓN:/);
  });

  it('cada renglón de los linderos termina con guiones', () => {
    const xml = `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="hyphen" w:pos="8894"/></w:tabs></w:pPr><w:r><w:t>NORTE: con el lote 12.</w:t><w:br/><w:t>SUR: con la calle 24B Sur.</w:t></w:r><w:r><w:tab/></w:r></w:p>`;
    const [p] = textos(aplicarFormatoNotarial(xml, ANCHO));
    expect(p.split('\n').every((l) => /\. -{30,}$/.test(l))).toBe(true);
  });

  it('negrilla en títulos de cláusula, nombres, datos en mayúsculas y cifras', () => {
    const t = 'PRIMERO: Que transfiere a quien dijo ser, MAURICIO MOGOLLON OVIEDO, identificado con cédula número 1.110.459.244 expedida en Neiva (H), por la suma de CIEN MILLONES DE PESOS M/CTE ($100.000.000), según la Ley 2010 de 2019, SI ___ NO ___.';
    const b = tramosNegrilla(t).map(([a, z]) => t.slice(a, z));
    expect(b).toEqual(['PRIMERO:', 'MAURICIO MOGOLLON OVIEDO', '1.110.459.244', 'CIEN MILLONES DE PESOS M/CTE ($100.000.000)']);
    expect(tramosNegrilla('en la CARRERA 99 NÚMERO 1A SUR 01 - URBANIZACION DE PRUEBA, en').map(([a, z]) => 'en la CARRERA 99 NÚMERO 1A SUR 01 - URBANIZACION DE PRUEBA, en'.slice(a, z))).toEqual(['CARRERA 99 NÚMERO 1A SUR 01 - URBANIZACION DE PRUEBA']);
    expect(negrillas(aplicarFormatoNotarial(conGuia('SEGUNDO. TRADICIÓN: Que lo adquirió.'), ANCHO))).toEqual(['SEGUNDO. TRADICIÓN:']);
  });

  it('carátula: documento y valor alineados a la derecha; número y fecha sin relleno', () => {
    const xml = aplicarFormatoNotarial([
      conGuia('ESCRITURA PÚBLICA NÚMERO:'), conGuia('FECHA DE OTORGAMIENTO:'), conGuia('PERSONAS QUE INTERVIENEN EN EL ACTO'),
      sinGuia('ALVARO PRUEBA LUNA 1.075.000.111'), conGuia('CODIGO DE LA NOTARIA 410010001.'), conGuia('ESPECIFICACION VALOR DEL ACTO'),
      sinGuia('COMPRAVENTA $3.000.000'), conGuia('MATRICULA INMOBILIARIA: 200-1.'),
    ].join(''), ANCHO);
    const t = textos(xml);
    expect(t.slice(0, 4)).toEqual(['ESCRITURA PÚBLICA NÚMERO:', '', 'FECHA DE OTORGAMIENTO:', '']);
    expect(t).toContain('ALVARO PRUEBA LUNA\t1.075.000.111');
    expect(t).toContain('ESPECIFICACION\tVALOR DEL ACTO');
    expect(t).toContain('COMPRAVENTA\t$3.000.000');
    expect(t[t.indexOf('COMPRAVENTA\t$3.000.000') + 1]).toMatch(/^-{100,}$/);
    expect(xml).toContain(`<w:tab w:val="right" w:pos="${ANCHO}"/>`);
  });

  it('márgenes de la minuta de la notaría', () => {
    expect(aplicarMargenes('<w:pgMar w:top="1871" w:right="1361" w:bottom="737" w:left="1985" w:header="709"/>'))
      .toBe('<w:pgMar w:top="1701" w:right="1247" w:bottom="510" w:left="1758" w:header="709"/>');
  });
});
