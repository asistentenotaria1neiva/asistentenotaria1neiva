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
    expect(p).toMatch(/^MATRICULA INMOBILIARIA: 200-301776\. -{40,}$/);
    // Un renglón lleno: los guiones no caben y no se agregan
    const lleno = 'a'.repeat(Math.floor(RENGLON / 556));
    expect(guionesDeRelleno([{ texto: lleno, negrilla: false }], RENGLON)).toBe(0);
  });

  it('quita los renglones en blanco hechos con saltos de línea dentro del párrafo', () => {
    const p = '<w:p><w:r><w:t xml:space="preserve">MATRICULA INMOBILIARIA: 200-190650.</w:t><w:br/><w:br/><w:t xml:space="preserve">CEDULA CATASTRAL: 4100101.</w:t><w:br/></w:r><w:r><w:br/><w:t xml:space="preserve">OFICINA DE REGISTRO DE NEIVA.</w:t><w:br/></w:r></w:p>';
    const [t] = textos(aplicarFormatoNotarial(p, ANCHO));
    expect(t).not.toMatch(/\n[\s-]*\n/);
    expect(t).not.toMatch(/\n[\s-]*$/);
    expect(t.split('\n')).toHaveLength(3);
  });

  it('la expedición de la cédula va en minúscula y sin negrilla aunque la plantilla la traiga así', () => {
    const p = '<w:p><w:r><w:t xml:space="preserve">Que la señora </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">CLARA ROJAS ARDILA</w:t></w:r><w:r><w:t xml:space="preserve">, identificada con cédula número </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">36.169.118 EXPEDIDA EN NEIVA</w:t></w:r><w:r><w:t xml:space="preserve">, en la fecha.</w:t></w:r></w:p>';
    const xml = aplicarFormatoNotarial(p, ANCHO);
    expect(textos(xml)[0]).toContain('36.169.118 expedida en Neiva, en la fecha.');
    const b = negrillas(xml).join('|');
    expect(b).toContain('36.169.118');
    expect(b).toContain('CLARA ROJAS ARDILA');
    expect(b).not.toMatch(/expedida|Neiva/i);
  });

  it('el número y la fecha de una escritura citada van solo en cifras', () => {
    const p = '<w:p><w:r><w:t xml:space="preserve">SEGUNDO: Que mediante escritura pública número </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">TRES MIL CIENTO SESENTA Y CUATRO (3164)</w:t></w:r><w:r><w:t xml:space="preserve"> del </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">VEINTIDOS (22) DE SEPTIEMBRE DE DOS MIL VEINTIDOS (2022)</w:t></w:r><w:r><w:t xml:space="preserve">, otorgada en la Notaria Primera de Neiva, por NOVENTA MILLONES DE PESOS M/CTE ($90.000.000).</w:t></w:r></w:p>';
    const xml = aplicarFormatoNotarial(p, ANCHO);
    const t = textos(xml)[0];
    expect(t).toContain('escritura pública número 3164 del 22 DE SEPTIEMBRE DE 2022, otorgada');
    // Los valores siguen en letras y en cifras
    expect(t).toContain('NOVENTA MILLONES DE PESOS M/CTE ($90.000.000)');
    const b = negrillas(xml).join('|');
    expect(b).toContain('3164');
    expect(b).toContain('22 DE SEPTIEMBRE DE 2022');
    // También con la fecha en minúscula y la cita en una sola corrida
    const q = textos(aplicarFormatoNotarial(sinGuia('según escritura pública No. MIL DOSCIENTOS TREINTA Y CUATRO (1.234) de fecha doce (12) de marzo de dos mil veinte (2020) de la Notaría'), ANCHO))[0];
    expect(q).toContain('escritura pública No. 1.234 de fecha 12 DE MARZO DE 2020 de la Notaría');
  });

  it('pone en negrilla los datos del inmueble de la carátula, y no el cuerpo', () => {
    const xml = aplicarFormatoNotarial([
      sinGuia('ESPECIFICACION VALOR DEL ACTO'),
      sinGuia('CANCELACION DE HIPOTECA $90.000.000'),
      sinGuia('MATRICULA INMOBILIARIA: 200-190650.'),
      sinGuia('CEDULA CATASTRAL: 41001010100000024.'),
      sinGuia('OFICINA DE REGISTRO DE INSTRUMENTOS PÚBLICOS DE NEIVA - HUILA.'),
      sinGuia('Compareció la señora del caso.'),
    ].join(''), ANCHO);
    const b = negrillas(xml).join('|');
    expect(b).toContain('MATRICULA INMOBILIARIA: 200-190650.');
    expect(b).toContain('CEDULA CATASTRAL: 41001010100000024.');
    expect(b).toContain('OFICINA DE REGISTRO DE INSTRUMENTOS PÚBLICOS DE NEIVA - HUILA.');
    expect(b).not.toContain('Compareció');
  });

  it('también con el valor del acto en blanco («COMPRAVENTA $____») antes de los datos', () => {
    const xml = aplicarFormatoNotarial([
      sinGuia('ESPECIFICACION VALOR DEL ACTO'),
      '<w:p><w:r><w:t xml:space="preserve">COMPRAVENTA $</w:t></w:r><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>____________________</w:t></w:r></w:p>',
      sinGuia('MATRICULA INMOBILIARIA: 200-291172.'),
      sinGuia('CEDULA CATASTRAL: 416150000000000030023000000000.'),
      sinGuia('CEDULA CATASTRAL PAZ Y SALVO: 41-615-00-00-00-00-0003-0035-0-00-00-0000.'),
      sinGuia('NOMBRE O DIRECCIÓN DEL INMUEBLE: LOTE 5 H.'),
      sinGuia('OFICINA DE REGISTRO DE INSTRUMENTOS PÚBLICOS DE NEIVA - HUILA.'),
      sinGuia('Comparecieron quienes dijeron ser, LUIS EDUARDO ZABALA CORDOBA, mayor de edad, domiciliado en la ciudad de Neiva, quien obra en su propio nombre y manifestó que vende el inmueble.'),
    ].join(''), ANCHO);
    const b = negrillas(xml).join('|');
    expect(b).toContain('CEDULA CATASTRAL: 416150000000000030023000000000.');
    expect(b).toContain('CEDULA CATASTRAL PAZ Y SALVO: 41-615-00-00-00-00-0003-0035-0-00-00-0000.');
    expect(b).toContain('MATRICULA INMOBILIARIA: 200-291172.');
    expect(b).not.toMatch(/Comparecieron|mayor de edad/);
  });

  it('solo guiones escritos, como en las minutas: sin tabulación de relleno (en Word anula la tecla Tab)', () => {
    const xml = aplicarFormatoNotarial(conGuia('Texto de la cláusula.') + sinGuia('LOS OTORGANTES,'), ANCHO);
    // La guía de la plantilla (en 8894) se quita y no se pone otra
    expect(xml).not.toContain('w:pos="8894"');
    expect(xml).not.toContain('w:leader');
    expect(xml).not.toContain('<w:tab/>');
    expect(textos(xml)[0]).toMatch(/^Texto de la cláusula\. -{70,}$/);
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
    expect(t[0]).toMatch(/^OFICINA DE REGISTRO DE INSTRUMENTOS PÚBLICOS DE NEIVA - HUILA\. -{3,}$/);
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
    expect(p.split('\n').every((l) => /\. -{30,}$/.test(l))).toBe(true);
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
    expect(t[0]).toMatch(/^ESCRITURA PÚBLICA NÚMERO: -{40,}$/);
    expect(t[1]).toMatch(/^FECHA DE OTORGAMIENTO: -{40,}$/);
    expect(t[3]).toMatch(/^-{20,} PERSONAS QUE INTERVIENEN EN EL ACTO -{20,}$/);
    expect(t).toContain('ALVARO PRUEBA LUNA\t1.075.000.111');
    expect(t).toContain('ESPECIFICACION\tVALOR DEL ACTO');
    expect(t).toContain('COMPRAVENTA\t$3.000.000');
    expect(t[t.indexOf('COMPRAVENTA\t$3.000.000') + 1]).toMatch(/^-{100,}$/);
    expect(xml).toContain(`<w:tab w:val="right" w:pos="${ANCHO}"/>`);
  });

  it('carátula: la sangría se aplica aunque la IA escriba los rótulos con rayas, sin dos puntos o con columna de código', () => {
    const conTab = (texto: string) => `<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:t xml:space="preserve">${texto.replace(/\t/g, '</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">')}</w:t></w:r></w:p>`;
    for (const c of ['ESCRITURA PÚBLICA NÚMERO: ____________', 'ESCRITURA PÚBLICA NÚMERO: ----------------', 'ESCRITURA PÚBLICA NÚMERO', 'FECHA DE OTORGAMIENTO: _______']) {
      const xml = aplicarFormatoNotarial(conTab(c), ANCHO);
      expect(xml).toContain('<w:ind w:left="720"/>');
      expect(textos(xml)[0]).toMatch(/^(ESCRITURA PÚBLICA NÚMERO|FECHA DE OTORGAMIENTO): -{30,}$/);
    }
    for (const c of ['ESPECIFICACIÓN:\tVALOR DEL ACTO:', 'CÓDIGO\tESPECIFICACIÓN\tVALOR DEL ACTO', 'CODIGO ESPECIFICACION VALOR DEL ACTO']) {
      expect(aplicarFormatoNotarial(conTab(c), ANCHO)).toContain('<w:ind w:firstLine="720"/>');
    }
    // La línea de guiones bajo la fecha también va tabulada (la de antes de «PERSONAS…», si no la trae)
    for (const bloque of [[conTab('FECHA DE OTORGAMIENTO:'), conTab('------------------'), conTab('PERSONAS QUE INTERVIENEN EN EL ACTO')], [conTab('FECHA DE OTORGAMIENTO:'), conTab('PERSONAS QUE INTERVIENEN EN EL ACTO')]]) {
      const parrafos = aplicarFormatoNotarial(bloque.join(''), ANCHO).match(/<w:p[ >].*?<\/w:p>/gs) ?? [];
      expect(parrafos[1]).toContain('<w:ind w:left="720"/>');
      expect(textos(parrafos[1])[0]).toMatch(/^-{90,}$/);
    }
  });

  it('carátula como la minuta de la notaría: sangría de una tabulación y cinco renglones para el notario', () => {
    const xml = aplicarFormatoNotarial([
      conGuia('ESCRITURA PÚBLICA NÚMERO:'), sinGuia(''), conGuia('FECHA DE OTORGAMIENTO:'), conGuia('ESPECIFICACION VALOR DEL ACTO'),
      sinGuia('COMPRAVENTA $3.000.000'), conGuia('MATRICULA INMOBILIARIA: 200-1.'),
      conGuia('OFICINA DE REGISTRO DE INSTRUMENTOS PÚBLICOS DE NEIVA - HUILA.'), sinGuia('---------------'),
      conGuia('MATRICULA INMOBILIARIA: 200-2.'), conGuia('OFICINA DE REGISTRO DE INSTRUMENTOS PÚBLICOS DE NEIVA - HUILA.'),
      sinGuia(''), sinGuia(''),
      conGuia('En la ciudad de Neiva, Departamento del Huila, donde funciona la NOTARÍA PRIMERA DEL CÍRCULO DE NEIVA, cuyo notario titular es el doctor X.'),
      conGuia('Compareció quien dijo ser, ANA PRUEBA, mayor de edad.'),
      conGuia('OFICINA DE REGISTRO DE INSTRUMENTOS PÚBLICOS DE NEIVA - HUILA.'), conGuia('PRIMERO: Que transfiere.'),
    ].join(''), ANCHO);
    const parrafos = xml.match(/<w:p[ >].*?<\/w:p>/gs) ?? [];
    const t = textos(xml);
    // Número y fecha con sangría izquierda de una tabulación; «ESPECIFICACION» con sangría de primera línea
    expect(parrafos[0]).toContain('<w:ind w:left="720"/>');
    expect(parrafos[1]).toContain('<w:ind w:left="720"/>');
    expect(t[0]).toMatch(/^ESCRITURA PÚBLICA NÚMERO: -{30,}$/);
    expect(parrafos[t.indexOf('ESPECIFICACION\tVALOR DEL ACTO')]).toContain('<w:ind w:firstLine="720"/>');
    // Tras el último inmueble (no entre inmuebles): exactamente cinco renglones vacíos, en lugar del encabezado del notario
    const ultima = t.findIndex((x, i) => i > t.findIndex((y) => y.startsWith('MATRICULA INMOBILIARIA: 200-2')) && x.startsWith('OFICINA DE REGISTRO'));
    expect(t.slice(ultima + 1, ultima + 6)).toEqual(['', '', '', '', '']);
    expect(t[ultima + 6]).toMatch(/^-{100,}$/);
    expect(t[ultima + 7]).toMatch(/^Compareció/);
    expect(t.filter((x) => x === '')).toHaveLength(5);
    expect(t.join('\n')).not.toContain('En la ciudad de Neiva');
  });

  it('el encabezado del notario sale en blanco aunque no siga al último inmueble (o no haya carátula)', () => {
    const encabezado = conGuia('En la ciudad de Neiva, Departamento del Huila, Republica de Colombia, al «FALTA: fecha de otorgamiento», en el CIRCULO NOTARIAL DE NEIVA, donde funciona la Notaria Primera cuyo notario titular en el ejercicio es el doctor LUIS IGNACIO VIVAS CEDEÑO. ------------');
    for (const bloque of [
      [conGuia('ESCRITURA PÚBLICA NÚMERO:'), conGuia('MATRICULA INMOBILIARIA: 200-1.'), conGuia('UBICACIÓN: LOTE 1, NEIVA.'), conGuia('VALOR: $1.000'), encabezado, conGuia('Compareció ANA PRUEBA.')],
      [encabezado, conGuia('Compareció ANA PRUEBA.')],
    ]) {
      const t = textos(aplicarFormatoNotarial(bloque.join(''), ANCHO));
      const i = t.findIndex((x) => x === '');
      expect(t.slice(i, i + 5)).toEqual(['', '', '', '', '']);
      expect(t.filter((x) => x === '')).toHaveLength(5);
      expect(t.join('\n')).not.toMatch(/En la ciudad de Neiva|fecha de otorgamiento/);
      expect(t[t.length - 1]).toMatch(/^Compareció/);
    }
  });

  it('carta y márgenes de la notaría (sup. 3 / inf. 0,9 / interior 3,1 / exterior 2,2 cm, encuadernación 0)', () => {
    expect(aplicarMargenes('<w:pgSz w:w="12240" w:h="20160"/><w:pgMar w:top="1871" w:right="1361" w:bottom="737" w:left="1985" w:header="709"/>'))
      .toBe('<w:pgSz w:w="12240" w:h="15840" w:code="1"/><w:pgMar w:top="1701" w:right="1247" w:bottom="510" w:left="1758" w:header="709" w:gutter="0"/>');
    // 1 cm = 567 twips
    expect(MARGENES_NOTARIA).toEqual({ sup: Math.round(3 * 567), izq: Math.round(3.1 * 567), der: Math.round(2.2 * 567), inf: Math.round(0.9 * 567) });
  });

  it('márgenes simétricos: en las páginas pares se invierten interior y exterior', () => {
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
    const m = /^(-+) COMPRAVENTA (-+)$/.exec(p)!;
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
