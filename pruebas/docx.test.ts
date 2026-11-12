import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { plantillaNumerada, aplicarCambios, textoDocx, parrafosDe, documentoXml, faltantesEn, patronFragmento, formatoNotaria, formatoPagina, normalizarMarcas } from '@/lib/escritura/docx';
import { datosDeLaPlantillaAnterior, restosDelNegocioAnterior, valoresEnLetras, pendientes } from '@/lib/escritura/verificaciones';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const r = (t: string, negrilla = false) => `<w:r>${negrilla ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
const p = (...runs: string[]) => `<w:p><w:pPr><w:jc w:val="both"/></w:pPr>${runs.join('')}</w:p>`;

function docx(cuerpo: string): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${cuerpo}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1" w:right="1" w:bottom="1" w:left="1"/></w:sectPr></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
}

const PLANTILLA = docx([
  p(r('Compareció '), r('PEDRO PEREZ GOMEZ', true), r(', mayor de edad, identificado con cédula número 12.345.678 de Neiva. ----------')),
  p(r('---------------------------------------------')),
  p(r('PRIMERO: Que vende el inmueble con matrícula 200-84274 por CIEN MILLONES DE PESOS ($100.000.000).')),
  p(r('SEGUNDO: Se cancela el patrimonio de familia.')),
  '<w:tbl><w:tr><w:tc>' + p(r('Celda con dato 200-84274')) + '</w:tc></w:tr></w:tbl>',
  p(r('TERCERO: Cláusula final.')),
].join(''));

describe('plantilla numerada para la IA', () => {
  it('numera los párrafos, omite las líneas de guiones y quita los guiones de relleno', () => {
    const n = plantillaNumerada(PLANTILLA);
    expect(n.texto).toContain('[1] Compareció PEDRO PEREZ GOMEZ, mayor de edad, identificado con cédula número 12.345.678 de Neiva.');
    expect(n.texto).not.toContain('---');
    expect(n.texto).not.toMatch(/^\[2\]/m);
    expect(n.texto).toContain('[5] (tabla) Celda con dato 200-84274');
    expect(n.parrafos).toBe(5);
  });
});

describe('cambios de la IA sobre la plantilla', () => {
  it('reemplaza fragmentos conservando el formato de la corrida y resalta lo que falta', () => {
    const { docx: salida, aplicados, noAplicados } = aplicarCambios(PLANTILLA, [
      { p: 1, accion: 'REEMPLAZAR', reemplazos: [{ original: 'PEDRO PEREZ GOMEZ', nuevo: 'ANA MARÍA RUIZ' }, { original: 'identificado con cédula número 12.345.678', nuevo: 'identificada con cédula número «FALTA: cédula de la vendedora»' }], texto: '', insertar_despues: [] },
    ]);
    expect(aplicados).toBe(2);
    expect(noAplicados).toEqual([]);
    const xml = documentoXml(salida);
    expect(xml).toContain('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">ANA MARÍA RUIZ</w:t></w:r>');
    expect(xml).toMatch(/<w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve">«FALTA: cédula de la vendedora»/);
    expect(faltantesEn(textoDocx(salida))).toEqual(['cédula de la vendedora']);
  });

  it('elimina párrafos (en una tabla solo los vacía), reescribe e inserta con el formato del párrafo', () => {
    const { docx: salida, eliminados, insertados } = aplicarCambios(PLANTILLA, [
      { p: 4, accion: 'ELIMINAR', reemplazos: [], texto: '', insertar_despues: [] },
      { p: 5, accion: 'ELIMINAR', reemplazos: [], texto: '', insertar_despues: [] },
      { p: 6, accion: 'REESCRIBIR', reemplazos: [], texto: 'TERCERO: Cláusula **nueva**.', insertar_despues: ['CUARTO: Otra.'] },
    ]);
    const texto = textoDocx(salida);
    expect(texto).not.toContain('patrimonio de familia');
    expect(texto).not.toContain('Celda con dato');
    expect(documentoXml(salida)).toContain('<w:tc><w:p>'); // la celda conserva su párrafo
    expect(texto).toContain('TERCERO: Cláusula nueva.\nCUARTO: Otra.');
    expect(eliminados).toBe(1);
    expect(insertados).toBe(1);
    expect(parrafosDe(documentoXml(salida)).find((x) => x.texto.startsWith('CUARTO'))?.xml).toContain('<w:jc w:val="both"/>');
  });

  it('ubica el fragmento aunque cruce los guiones de relleno o cambien tildes y espacios', () => {
    expect(patronFragmento('de Neiva.  ').test('de Neiva. ------')).toBe(true);
    expect([...'identificado con cedula numero'.matchAll(patronFragmento('identificado con cédula número'))]).toHaveLength(1);
    const { noAplicados } = aplicarCambios(PLANTILLA, [{ p: 3, accion: 'REEMPLAZAR', reemplazos: [{ original: 'no está en el párrafo', nuevo: 'x' }], texto: '', insertar_despues: [] }]);
    expect(noAplicados).toHaveLength(1);
  });

  it('el resultado con el formato de la notaría sigue siendo un Word válido', () => {
    const { docx: salida } = aplicarCambios(PLANTILLA, [{ p: 3, accion: 'REEMPLAZAR', reemplazos: [{ original: '200-84274', nuevo: '200-99999' }], texto: '', insertar_despues: [] }]);
    const final = formatoNotaria(salida);
    expect(textoDocx(final)).toContain('200-99999');
    expect(documentoXml(final)).toContain('<w:pgMar');
  });
});

describe('la escritura conserva la forma de la plantilla', () => {
  const tab = '<w:r><w:tab/></w:r>';
  const CARATULA = docx([
    p(r('PERSONAS QUE INTERVIENEN EN EL ACTO')),
    p(r('REPRESENTADA POR ALIX CAÑON LAMILLA', true), tab, tab, r('1.075.212.554', true)),
    p(r('ANTECEDENTES')),
    p(r('PARÁGRAFO PRIMERO: Texto del parágrafo. ---------------------')),
    p(r('PARÁGRAFO SEGUNDO: Otro texto sin guiones.')),
  ].join(''));
  const textos = (b: Buffer) => parrafosDe(documentoXml(b)).map((x) => x.texto);

  it('no agrega renglones, líneas de guiones ni guiones a lo que no cambió', () => {
    const { docx: salida } = aplicarCambios(CARATULA, [{ p: 4, accion: 'REEMPLAZAR', reemplazos: [{ original: 'Texto del parágrafo', nuevo: 'Texto nuevo bastante más largo del parágrafo' }], texto: '', insertar_despues: [] }]);
    const t = textos(formatoPagina(salida));
    expect(t).toHaveLength(5);
    expect(t[0]).toBe('PERSONAS QUE INTERVIENEN EN EL ACTO');
    expect(t[2]).toBe('ANTECEDENTES');
    expect(t[4]).toBe('PARÁGRAFO SEGUNDO: Otro texto sin guiones.');
    // El párrafo cambiado tenía relleno: se recalcula (los guiones viejos no quedan sueltos)
    expect(t[3]).toMatch(/^PARÁGRAFO PRIMERO: Texto nuevo bastante más largo del parágrafo\. -{10,}\t$/);
  });

  it('en la carátula el valor nuevo queda contra el margen, en negrilla como en la plantilla', () => {
    const { docx: salida } = aplicarCambios(CARATULA, [{ p: 2, accion: 'REEMPLAZAR', reemplazos: [{ original: 'ALIX CAÑON LAMILLA 1.075.212.554', nuevo: 'MARIA ISABEL QUINTERO 36.111.222' }], texto: '', insertar_despues: [] }]);
    const x = parrafosDe(documentoXml(salida))[1];
    expect(x.texto).toBe('REPRESENTADA POR MARIA ISABEL QUINTERO\t36.111.222');
    expect(x.xml).toMatch(/<w:tabs><w:tab w:val="right" w:pos="\d+"\/><\/w:tabs>/);
    expect(x.runs.filter((y) => y.texto?.trim()).every((y) => y.rPr.includes('<w:b/>'))).toBe(true);
  });
});

describe('cambios ubicados en otro párrafo', () => {
  // Un renglón «Hoja No 2.» parte la comparecencia: la IA pide el cambio en el párrafo 1, pero el comprador está en el 3
  const PARTIDA = docx([
    p(r('Comparecieron a. ALIX CAÑON LAMILLA, quien obra en representación de la sociedad constituida mediante Acta, ')),
    p(r('Hoja No 2. -----------------------')),
    p(r('inscrita en la Cámara de Comercio. c. CESAR ALFONSO LEAL VALENZUELA, mayor de edad, identificado con cédula número 1.075.306.559.')),
  ].join(''));

  it('aplica el reemplazo en el párrafo vecino que tiene el texto', () => {
    const r = aplicarCambios(PARTIDA, [{ p: 1, accion: 'REEMPLAZAR', reemplazos: [{ original: 'CESAR ALFONSO LEAL VALENZUELA, mayor de edad, identificado con cédula número 1.075.306.559', nuevo: 'DANIELA XIMENA CARDOZO JIMENEZ, mayor de edad, identificada con cédula número 1.080.937.337' }], texto: '', insertar_despues: [] }]);
    expect(r.noAplicados).toHaveLength(0);
    expect(r.reubicados).toBe(1);
    expect(textoDocx(r.docx)).toContain('c. DANIELA XIMENA CARDOZO JIMENEZ, mayor de edad, identificada con cédula número 1.080.937.337.');
    expect(r.textos.get(3)).toContain('DANIELA');
  });
});

describe('restos del negocio anterior por párrafo', () => {
  it('señala en cada párrafo los datos de la plantilla que no están en los documentos', () => {
    const plantilla = new Map([[1, 'Compareció CESAR ALFONSO LEAL VALENZUELA, mayor de edad, con cédula 1.075.306.559'], [2, 'Subsidio de COLSUBSIDIO para CESAR ALFONSO LEAL VALENZUELA'], [3, 'Fiduciaria con NIT 800.155.413-6']]);
    const actuales = new Map([[1, 'Compareció DANIELA XIMENA CARDOZO JIMENEZ, mayor de edad, con cédula 1.080.937.337'], [2, 'Subsidio de COLSUBSIDIO para CESAR ALFONSO LEAL VALENZUELA'], [3, 'Fiduciaria con NIT 800.155.413-6']]);
    const restos = restosDelNegocioAnterior(plantilla, actuales, 'DANIELA XIMENA CARDOZO JIMENEZ 1.080.937.337 Fiduciaria NIT 800.155.413-6');
    expect([...restos.keys()]).toEqual([2]);
    expect(restos.get(2)![0]).toContain('CESAR ALFONSO LEAL VALENZUELA');
  });
});

describe('marcas', () => {
  it('lleva a su forma única las marcas escritas sin comillas', () => {
    expect(normalizarMarcas('con área de FALTA: área del inmueble, FALTA: mejoras, determinado')).toBe('con área de «FALTA: área del inmueble», «FALTA: mejoras», determinado');
    expect(normalizarMarcas('lo que falta: nada')).toBe('lo que falta: nada');
  });
});

describe('verificaciones sin IA', () => {
  it('señala números y nombres de la plantilla que siguen en la escritura y no están en los documentos', () => {
    const plantilla = new Map([[1, 'Compareció PEDRO PEREZ GOMEZ, mayor de edad, identificado con cédula número 12.345.678'], [3, 'matrícula 200-84274']]);
    const a = datosDeLaPlantillaAnterior({ plantilla, escritura: 'Compareció PEDRO PEREZ GOMEZ, mayor de edad, cédula 12.345.678, matrícula 200-84274', fuentes: 'Certificado: matrícula 200-84274' });
    expect(a.map((x) => x.detalle).join(' ')).toContain('12.345.678');
    expect(a.map((x) => x.detalle).join(' ')).toContain('PEDRO PEREZ GOMEZ');
    expect(a.map((x) => x.detalle).join(' ')).not.toContain('200-84274');
  });

  it('valores en letras que no corresponden a la cifra', () => {
    expect(valoresEnLetras('por la suma de CIEN MILLONES DE PESOS ($100.000.000) moneda corriente')).toEqual([]);
    expect(valoresEnLetras('por la suma de NOVENTA MILLONES DE PESOS ($100.000.000) moneda corriente')).toHaveLength(1);
  });

  it('resume los faltantes y los cambios no aplicados', () => {
    expect(pendientes(['cédula'], [], [{ p: 2, original: 'x', motivo: 'No se encontró' }])).toHaveLength(2);
  });
});
