import { describe, expect, it } from 'vitest';
import { aplicarAjustesNotariales, aplicarEstilosNotariales, aplicarFormatoNotarial, aplicarMargenes, guionesDeRelleno, tramosNegrilla, MARGENES_NOTARIA } from '@/lib/escritura/formato-notarial';

const ANCHO = 12240 - MARGENES_NOTARIA.izq - MARGENES_NOTARIA.der;
/** Ancho del renglón en milésimas de em de Arial 12 */
const RENGLON = ANCHO / 20 * 1000 / 12;
const conGuia = (texto: string) => `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="hyphen" w:pos="8894"/></w:tabs><w:jc w:val="both"/></w:pPr><w:r><w:t xml:space="preserve">${texto}</w:t></w:r><w:r><w:tab/></w:r></w:p>`;
const sinGuia = (texto: string) => `<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t xml:space="preserve">${texto}</w:t></w:r></w:p>`;
const textos = (xml: string) => (xml.match(/<w:p[ >].*?<\/w:p>/gs) ?? []).map((p) => p.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, ''));
const negrillas = (xml: string) => (xml.match(/<w:r><w:rPr>(?:(?!<\/w:rPr>).)*<w:b\/>.*?<\/w:r>/gs) ?? []).map((r) => r.replace(/<[^>]+>/g, ''));

describe('formato de impresión de la notaría', () => {
  it('completa el último renglón con guiones escritos, sin pasarse al siguiente', () => {
    const [p] = textos(aplicarFormatoNotarial(conGuia('MATRICULA INMOBILIARIA: 200-301776.'), ANCHO));
    expect(p).toMatch(/^MATRICULA INMOBILIARIA: 200-301776\. -{40,}\t$/);
    // Un renglón lleno: los guiones no caben y no se agregan
    const lleno = 'a'.repeat(Math.floor(RENGLON / 556));
    expect(guionesDeRelleno([{ texto: lleno, negrilla: false }], RENGLON)).toBe(0);
  });

  it('guiones escritos (Google Docs no muestra el relleno de la tabulación) y una tabulación al margen que completa lo que falta', () => {
    const xml = aplicarFormatoNotarial(conGuia('Texto de la cláusula.') + sinGuia('LOS OTORGANTES,'), ANCHO);
    // La guía de la plantilla (en 8894) se cambia por una sola, en el margen derecho
    expect(xml).not.toContain('w:pos="8894"');
    expect(xml.match(/w:leader="hyphen"/g)).toHaveLength(1);
    expect(xml).toContain(`<w:tabs><w:tab w:val="right" w:leader="hyphen" w:pos="${ANCHO}"/></w:tabs>`);
    expect(textos(xml)[0]).toMatch(/^Texto de la cláusula\. -{70,}\t$/);
    // El encabezado de las firmas no se rellena
    expect(textos(xml)[1]).toBe('LOS OTORGANTES,');
  });

  it('completa también los párrafos que la plantilla dejó sin guiones, salvo celdas de tabla y firmas', () => {
    const xml = aplicarFormatoNotarial([
      sinGuia('OFICINA DE REGISTRO DE INSTRUMENTOS PÚBLICOS DE NEIVA - HUILA.'),
      `<w:tbl><w:tr><w:tc>${sinGuia('Celda')}</w:tc></w:tr></w:tbl>`,
      sinGuia('De lo cual doy fe.'), sinGuia('______________________________________'), sinGuia('NOMBRE'),
    ].join(''), ANCHO);
    const t = textos(xml);
    expect(t[0]).toMatch(/^OFICINA DE REGISTRO DE INSTRUMENTOS PÚBLICOS DE NEIVA - HUILA\. -{3,}\t$/);
    expect(t[1]).toBe('Celda');
    // Justo antes del renglón de firma no se rellena; en la zona de firmas tampoco
    expect(t.slice(2)).toEqual(['De lo cual doy fe.', '______________________________________', 'NOMBRE']);
  });

  it('una palabra que cabe en el renglón por muy poco no hace que los guiones se pasen al siguiente', () => {
    // «otorgantes» cabe en el primer renglón por 0,1 pt: Word la deja y otros visores la bajan
    const negrilla = { texto: 'OTORGAMIENTO Y AUTORIZACION.', negrilla: true };
    const resto = ' Leído el presente instrumento por los otorgantes se hicieron las advertencias pertinentes. Fin.';
    const n = guionesDeRelleno([negrilla, { texto: resto, negrilla: false }], RENGLON);
    // Con la palabra arriba o abajo, el último renglón «pertinentes. Fin.» + guiones cabe
    const sinOtorgantes = guionesDeRelleno([{ texto: 'se hicieron las advertencias pertinentes. Fin.', negrilla: false }], RENGLON);
    expect(n).toBeLessThanOrEqual(sinOtorgantes);
    expect(n).toBeGreaterThan(0);
  });

  it('pone una línea de guiones antes de cada cláusula', () => {
    const t = textos(aplicarFormatoNotarial(conGuia('PRIMERO: Que transfiere.') + conGuia('SEGUNDO. TRADICIÓN: Que lo adquirió.'), ANCHO));
    expect(t[1]).toMatch(/^-{100,}$/);
    expect(t[2]).toMatch(/^SEGUNDO\. TRADICIÓN:/);
  });

  it('cada renglón de los linderos termina con guiones', () => {
    const xml = `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="hyphen" w:pos="8894"/></w:tabs></w:pPr><w:r><w:t>NORTE: con el lote 12.</w:t><w:br/><w:t>SUR: con la calle 24B Sur.</w:t></w:r><w:r><w:tab/></w:r></w:p>`;
    const [p] = textos(aplicarFormatoNotarial(xml, ANCHO));
    expect(p.split('\n').every((l) => /\. -{30,}\t$/.test(l))).toBe(true);
  });

  it('negrilla en títulos de cláusula, nombres, datos en mayúsculas y cifras', () => {
    const t = 'PRIMERO: Que transfiere a quien dijo ser, MAURICIO MOGOLLON OVIEDO, identificado con cédula número 1.110.459.244 expedida en Neiva (H), por la suma de CIEN MILLONES DE PESOS M/CTE ($100.000.000), según la Ley 2010 de 2019, SI ___ NO ___.';
    const b = tramosNegrilla(t).map(([a, z]) => t.slice(a, z));
    expect(b).toEqual(['PRIMERO:', 'MAURICIO MOGOLLON OVIEDO', '1.110.459.244', 'CIEN MILLONES DE PESOS M/CTE ($100.000.000)']);
    expect(tramosNegrilla('en la CARRERA 99 NÚMERO 1A SUR 01 - URBANIZACION DE PRUEBA, en').map(([a, z]) => 'en la CARRERA 99 NÚMERO 1A SUR 01 - URBANIZACION DE PRUEBA, en'.slice(a, z))).toEqual(['CARRERA 99 NÚMERO 1A SUR 01 - URBANIZACION DE PRUEBA']);
    expect(negrillas(aplicarFormatoNotarial(conGuia('SEGUNDO. TRADICIÓN: Que lo adquirió.'), ANCHO))).toEqual(['SEGUNDO. TRADICIÓN:']);
  });

  it('carátula: documento y valor alineados a la derecha; número y fecha completados con guiones', () => {
    const xml = aplicarFormatoNotarial([
      conGuia('ESCRITURA PÚBLICA NÚMERO:'), conGuia('FECHA DE OTORGAMIENTO:'), conGuia('PERSONAS QUE INTERVIENEN EN EL ACTO'),
      sinGuia('ALVARO PRUEBA LUNA 1.075.000.111'), conGuia('CODIGO DE LA NOTARIA 410010001.'), conGuia('ESPECIFICACION VALOR DEL ACTO'),
      sinGuia('COMPRAVENTA $3.000.000'), conGuia('MATRICULA INMOBILIARIA: 200-1.'),
    ].join(''), ANCHO);
    const t = textos(xml);
    expect(t[0]).toMatch(/^ESCRITURA PÚBLICA NÚMERO: -{40,}	$/);
    expect(t[1]).toMatch(/^FECHA DE OTORGAMIENTO: -{40,}	$/);
    expect(t[3]).toMatch(/^-{20,} PERSONAS QUE INTERVIENEN EN EL ACTO -{20,}	$/);
    expect(t).toContain('ALVARO PRUEBA LUNA\t1.075.000.111');
    expect(t).toContain('ESPECIFICACION\tVALOR DEL ACTO');
    expect(t).toContain('COMPRAVENTA\t$3.000.000');
    expect(t[t.indexOf('COMPRAVENTA\t$3.000.000') + 1]).toMatch(/^-{100,}$/);
    expect(xml).toContain(`<w:tab w:val="right" w:pos="${ANCHO}"/>`);
  });

  it('Resolución 9146: carta y márgenes de la cara frontal (sup. 3 / izq. 3 / der. 2 / inf. 0,9 cm)', () => {
    expect(aplicarMargenes('<w:pgSz w:w="12240" w:h="20160"/><w:pgMar w:top="1871" w:right="1361" w:bottom="737" w:left="1985" w:header="709"/>'))
      .toBe('<w:pgSz w:w="12240" w:h="15840" w:code="1"/><w:pgMar w:top="1701" w:right="1134" w:bottom="510" w:left="1701" w:header="709" w:gutter="0"/>');
    // 1 cm = 567 twips
    expect(MARGENES_NOTARIA).toEqual({ sup: 3 * 567, izq: 3 * 567, der: 2 * 567, inf: 510 });
  });

  it('Resolución 9146: márgenes simétricos para la cara posterior (izq. 2 / der. 3 cm)', () => {
    const ajustes = '<?xml version="1.0"?><w:settings xmlns:w="w"><w:zoom w:percent="100"/><w:defaultTabStop w:val="709"/><w:compat><w:compatSetting w:name="x"/></w:compat></w:settings>';
    expect(aplicarAjustesNotariales(ajustes)).toBe('<?xml version="1.0"?><w:settings xmlns:w="w"><w:zoom w:percent="100"/><w:mirrorMargins/><w:defaultTabStop w:val="709"/><w:compat><w:compatSetting w:name="x"/></w:compat></w:settings>');
    expect(aplicarAjustesNotariales(aplicarAjustesNotariales(ajustes)).match(/mirrorMargins/g)).toHaveLength(1);
  });

  it('Resolución 9146: Arial 12, interlineado 1,5 y justificado completo en todo párrafo', () => {
    const xml = aplicarFormatoNotarial('<w:p><w:pPr><w:spacing w:after="200"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman"/><w:b/><w:sz w:val="28"/><w:u w:val="single"/></w:rPr><w:t>LOS OTORGANTES,</w:t></w:r><w:r><w:t> y otro texto.</w:t></w:r></w:p>', ANCHO);
    expect(xml).toContain('<w:spacing w:before="0" w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="both"/>');
    expect(xml).not.toMatch(/Times New Roman|w:val="28"|w:val="left"/);
    // Cada run en Arial 12, en el orden del esquema (fuente, negrilla, tamaño, subrayado)
    expect(xml).toContain('<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/><w:u w:val="single"/></w:rPr>');
    expect(xml.match(/<w:r>/g)!.length).toBe(xml.match(/<w:sz w:val="24"\/>/g)!.length);
  });

  it('Resolución 9146: los títulos centrados quedan justificados con guiones a ambos lados', () => {
    const [p] = textos(aplicarFormatoNotarial('<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>COMPRAVENTA</w:t></w:r></w:p>', ANCHO));
    const m = /^(-+) COMPRAVENTA (-+)	$/.exec(p)!;
    expect(m).not.toBeNull();
    expect(Math.abs(m[1].length - m[2].length)).toBeLessThanOrEqual(1);
  });

  it('Resolución 9146: sin renglones en blanco entre párrafos; sí el espacio para firmar', () => {
    const vacio = '<w:p><w:pPr><w:jc w:val="left"/></w:pPr></w:p>';
    const xml = aplicarFormatoNotarial([
      conGuia('PRIMERO: Que transfiere.'), vacio, vacio, conGuia('De lo cual doy fe.'), sinGuia('LOS OTORGANTES,'), vacio,
      sinGuia('______________________________________'), sinGuia('NOMBRE'), vacio, sinGuia('EL NOTARIO,'),
    ].join(''), ANCHO);
    const t = textos(xml);
    expect(t.slice(0, 2).map((x) => x.replace(/ -+	?$/, ''))).toEqual(['PRIMERO: Que transfiere.', 'De lo cual doy fe.']);
    expect(t.slice(2)).toEqual(['LOS OTORGANTES,', '', '______________________________________', 'NOMBRE', '', 'EL NOTARIO,']);
    // El salto de página de un anexo no se quita
    expect(aplicarFormatoNotarial('<w:p><w:r><w:br w:type="page"/></w:r></w:p>', ANCHO)).toContain('w:type="page"');
  });

  it('Resolución 9146: caben al menos 32 renglones por cara (Arial 12, interlineado 1,5)', () => {
    const altoUtil = 15840 - MARGENES_NOTARIA.sup - MARGENES_NOTARIA.inf; // twips
    const renglon = 12 * 1.149 * 1.5 * 20; // alto de un renglón de Arial 12 a 1,5 en twips
    expect(Math.floor(altoUtil / renglon)).toBeGreaterThanOrEqual(32);
  });

  it('Resolución 9146: estilos en Arial 12', () => {
    const e = aplicarEstilosNotariales('<w:styles xmlns:w="w"><w:style w:styleId="T"><w:rPr><w:rFonts w:asciiTheme="majorHAnsi"/><w:sz w:val="32"/></w:rPr></w:style></w:styles>');
    expect(e).toContain('<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial"');
    expect(e).not.toMatch(/majorHAnsi|w:val="32"/);
  });
});
