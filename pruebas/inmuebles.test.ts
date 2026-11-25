import { describe, it, expect } from 'vitest';
import { revisarBloquesDeInmuebles, revisarRemisionDeLinderos, esRemisionDeLinderos, traeLinderos } from '../src/lib/escritura/inmuebles';
import type { DocumentoLeido } from '../src/lib/ia/instrucciones';

// EXP-2026-00171: plantilla de un lote (un inmueble); la escritura lleva casa 2 y parqueaderos 2 y 3
const plantilla = new Map<number, string>([
  [15, 'TRANSFERENCIA DE DOMINIO A TITULO DE LEASING HABITACIONAL DE VIVIENDA FAMILIAR $130.000.000'],
  [17, 'MATRICULA INMOBILIARIA: 200-94549.'],
  [18, 'CEDULA CATASTRAL: 410010109000004320014000000000.'],
  [19, 'CEDULA CATASTRAL PAZ Y SALVO: 0109000004320014000000000.'],
  [20, 'NOMBRE O DIRECCION DEL INMUEBLE: CALLE 79A NÚMERO 1F-09 - LOTE 14 MANZANA G - URBANIZACION MINUTO DE DIOS ETAPA IV.'],
  [21, 'OFICINA DE REGISTRO DE INSTRUMENTOS PÚBLICOS DE NEIVA - HUILA.'],
  [23, 'En la ciudad de Neiva, Departamento del Huila, República de Colombia, a los VEINTIOCHO (28) DÍAS del mes de AGOSTO donde funciona la NOTARÍA PRIMERA DEL CÍRCULO DE NEIVA.'],
  [24, 'Comparecieron quienes dijeron ser, a. EDIL MATTA HERNANDEZ … SEGUNDO. OBJETO: … cuyas áreas, linderos y demás especificaciones son los siguientes:'],
  [25, 'URBANIZACION MINUTO DE DIOS ETAPA IV, ubicado en la CALLE 79A NÚMERO 1F-09 - LOTE 14 MANZANA G, con área de SETENTA Y OCHO PUNTO NOVENTA Y UN METROS CUADRADOS (78.91 M2), determinado por los siguientes linderos:'],
  [26, 'NORTE: En longitud de seis punto cero siete metros (6.07 m) con el lote 3 de la misma manzana.'],
  [27, 'SUR: En longitud de seis punto cero siete metros (6.07 m) con la calle 79A.'],
  [28, 'ORIENTE: En longitud de trece metros (13.00 m) con el lote 13 de la misma manzana. OCCIDENTE: En longitud de trece metros (13.00 m) con el lote 1 de la misma manzana.'],
  [30, 'MATRICULA INMOBILIARIA: 200-94549.'],
  [31, 'CEDULA CATASTRAL: 410010109000004320014000000000.'],
  [32, 'CEDULA CATASTRAL PAZ Y SALVO: 0109000004320014000000000.'],
  [33, 'PARÁGRAFO PRIMERO: No obstante, la mención de cabida, ubicación y linderos hecha anteriormente, la venta aquí contenida se hace como cuerpo cierto. TERCERO. TRADICIÓN: …'],
]);

const remision = (que: string) => `${que} MANZANA I ETAPA 2 del CONDOMINIO ROSALES, con área privada de ONCE METROS CUADRADOS (11.00 M2), cuyos linderos y demás especificaciones obran en la escritura pública 1484 del 20 de MAYO de 2013 de la Notaría 3 de Neiva.`;

/** Lo que salió en la versión 3 */
const generada = () => {
  const m = new Map(plantilla);
  m.set(17, ['MATRICULA INMOBILIARIA: 200-226027.',
    'MATRICULA INMOBILIARIA: 200-226028.', 'CEDULA CATASTRAL: 410010109000001300901900000096.', 'CEDULA CATASTRAL PAZ Y SALVO: 0109000013009019000000096.', 'NOMBRE O DIRECCIÓN DEL INMUEBLE: CALLE 69 NÚMERO 2-76 PARQUEADERO TRES (3) MANZANA I ETAPA 2.',
    'MATRICULA INMOBILIARIA: 200-226026.', 'CEDULA CATASTRAL: 410010109000001300901900000094.', 'CEDULA CATASTRAL PAZ Y SALVO: 0109000001300901900000094.', 'NOMBRE O DIRECCIÓN DEL INMUEBLE: CALLE 69 NÚMERO 2-76 PARQUEADERO DOS (2) MANZANA I ETAPA 2.'].join('\n'));
  m.set(18, 'CEDULA CATASTRAL: 4100101090000013009019000000092.');
  m.set(19, 'CEDULA CATASTRAL PAZ Y SALVO: 010900001300901900000092.');
  m.set(20, 'NOMBRE O DIRECCION DEL INMUEBLE: CALLE 69 NÚMERO 2-76 CASA DOS (2) MANZANA I ETAPA 2.');
  m.set(25, 'CASA DOS (2) MANZANA I ETAPA 2 del CONDOMINIO ROSALES, con área privada de CIENTO DOS PUNTO TREINTA Y SEIS METROS CUADRADOS (102.36 M2), cuyos linderos y demás especificaciones obran en la escritura pública 1484 del 20 de MAYO de 2013 de la Notaría 3 de Neiva.');
  m.set(26, '');
  m.set(27, '');
  m.set(28, remision('PARQUEADERO TRES (3)'));
  m.set(30, 'MATRICULA INMOBILIARIA: 200-226028.');
  m.set(31, 'CEDULA CATASTRAL: 410010109000001300901900000096.');
  m.set(32, ['CEDULA CATASTRAL PAZ Y SALVO: 0109000013009019000000096.', remision('PARQUEADERO DOS (2)'), 'MATRICULA INMOBILIARIA: 200-226026.', 'CEDULA CATASTRAL: 410010109000001300901900000094.', 'CEDULA CATASTRAL PAZ Y SALVO: 0109000001300901900000094.'].join('\n'));
  return m;
};

/** Como debió quedar: cada inmueble con su bloque completo y seguido */
const correcta = () => {
  const m = new Map(plantilla);
  m.set(17, 'MATRICULA INMOBILIARIA: 200-226027.');
  m.set(18, 'CEDULA CATASTRAL: 4100101090000013009019000000092.');
  m.set(19, 'CEDULA CATASTRAL PAZ Y SALVO: 010900001300901900000092.');
  m.set(20, ['NOMBRE O DIRECCION DEL INMUEBLE: CALLE 69 NÚMERO 2-76 CASA DOS (2) MANZANA I ETAPA 2.',
    'MATRICULA INMOBILIARIA: 200-226028.', 'CEDULA CATASTRAL: 410010109000001300901900000096.', 'NOMBRE O DIRECCIÓN DEL INMUEBLE: CALLE 69 NÚMERO 2-76 PARQUEADERO TRES (3) MANZANA I ETAPA 2.',
    'MATRICULA INMOBILIARIA: 200-226026.', 'CEDULA CATASTRAL: 410010109000001300901900000094.', 'CEDULA CATASTRAL PAZ Y SALVO: 0109000001300901900000094.', 'NOMBRE O DIRECCIÓN DEL INMUEBLE: CALLE 69 NÚMERO 2-76 PARQUEADERO DOS (2) MANZANA I ETAPA 2.'].join('\n'));
  m.set(25, 'CASA DOS (2) MANZANA I ETAPA 2 del CONDOMINIO ROSALES, con área privada de CIENTO DOS PUNTO TREINTA Y SEIS METROS CUADRADOS (102.36 M2), comprendida dentro de los siguientes linderos:');
  m.set(26, 'NORTE: Con la casa 1, línea recta con distancia siete punto treinta y dos metros (7.32 m).');
  m.set(27, 'SUR: Con la casa 3, línea recta con distancia siete punto treinta y dos metros (7.32 m).');
  m.set(28, 'ORIENTE: Con vía externa carrera 4, cinco punto noventa y cinco metros (5.95 m). OCCIDENTE: Con vía interna 3, cinco punto noventa y cinco metros (5.95 m).');
  m.set(30, 'MATRICULA INMOBILIARIA: 200-226027.');
  m.set(31, 'CEDULA CATASTRAL: 4100101090000013009019000000092.');
  m.set(32, ['CEDULA CATASTRAL PAZ Y SALVO: 010900001300901900000092.',
    'PARQUEADERO TRES (3) MANZANA I ETAPA 2, comprendido dentro de los siguientes linderos:', 'NORTE: Con parqueadero 2B, cuatro punto ochenta y un metros (4.81 m).',
    'MATRICULA INMOBILIARIA: 200-226028.', 'CEDULA CATASTRAL: 410010109000001300901900000096.',
    'PARQUEADERO DOS (2) MANZANA I ETAPA 2, comprendido dentro de los siguientes linderos:', 'NORTE: Con la casa 1, cuatro punto ochenta y un metros (4.81 m).',
    'MATRICULA INMOBILIARIA: 200-226026.', 'CEDULA CATASTRAL: 410010109000001300901900000094.'].join('\n'));
  return m;
};

const lecturas: DocumentoLeido[] = [
  { tipo: 'Certificado de tradición y libertad — matrícula 200-226027 (Casa Dos)', paginas: '27,29', resumen: '', fecha_documento: '', datos: [], alertas: [],
    textos_literales: [{ titulo: 'Descripción: cabida y linderos', pagina: 27, texto: 'CASA DOS (2) MANZANA I ETAPA 2 con area de PRIVADA 102.36 M2 cuyos linderos y demas especificaciones obran en ESCRITURA 1484, 2013/05/20, NOTARIA TERCERA NEIVA. Articulo 11 Decreto 1711 de 1984.' }] },
  { tipo: 'Escritura pública de compraventa (copia)', paginas: '75-90', resumen: '', fecha_documento: '', datos: [], alertas: [],
    textos_literales: [{ titulo: 'Linderos casa 2 (casa dos manzana I etapa 2)', pagina: 79, texto: 'POR EL NORTE, Con la casa 1, línea recta con distancia 7.32 metros. POR EL SUR, Con la casa 3, línea recta con distancia 7.32 metros. POR EL ORIENTE, Con vía externa carrera 4, 5.95 metros. POR EL OCCIDENTE, Con vía interna 3, 5.95 metros.' }] },
];

describe('bloques de los inmuebles', () => {
  it('detecta la carátula revuelta y la casa sin su bloque en la descripción (EXP-2026-00171)', () => {
    const r = revisarBloquesDeInmuebles(plantilla, generada());
    expect(r).toHaveLength(2);
    expect(r[0].motivo).toMatch(/CARÁTULA REVUELTA/);
    expect(r[0].parrafos).toEqual([17, 18, 19, 20]);
    expect(r[0].motivo).toMatch(/párrafo 20/);
    expect(r[1].motivo).toMatch(/200-226027/);
    expect(r[1].parrafos).toEqual(expect.arrayContaining([25, 26, 27, 28, 30, 31, 32]));
    expect(r[1].parrafos).not.toContain(24);
  });

  it('no dice nada cuando cada inmueble tiene su bloque completo y seguido', () => {
    expect(revisarBloquesDeInmuebles(plantilla, correcta())).toEqual([]);
  });

  it('no dice nada con un solo inmueble', () => {
    const m = new Map(plantilla);
    m.set(17, 'MATRICULA INMOBILIARIA: 200-12345.');
    m.set(30, 'MATRICULA INMOBILIARIA: 200-12345.');
    expect(revisarBloquesDeInmuebles(plantilla, m)).toEqual([]);
  });
});

describe('linderos como remisión del certificado', () => {
  it('reconoce la remisión y los linderos transcritos', () => {
    expect(esRemisionDeLinderos('PARQUEADERO DOS (2) con area de PRIVADA 11.00 M2 cuyos linderos y demas especificaciones obran en ESCRITURA 1484, 2013/05/20')).toBe(true);
    expect(esRemisionDeLinderos('con área de 78.91 M2, determinado por los siguientes linderos:')).toBe(false);
    expect(traeLinderos('NORTE: En longitud de seis punto cero siete metros (6.07 m) con el lote 3.')).toBe(true);
    expect(traeLinderos('cuyos linderos obran en la escritura 1484.')).toBe(false);
  });

  it('pide transcribirlos cuando la plantilla los transcribe y la escritura cargada los trae (EXP-2026-00171)', () => {
    const r = revisarRemisionDeLinderos(plantilla, generada(), lecturas);
    expect(r).not.toBeNull();
    expect(r!.parrafos).toEqual(expect.arrayContaining([25, 26, 27, 28, 32]));
    expect(r!.motivo).toMatch(/Linderos casa 2/);
    expect(r!.motivo).not.toMatch(/Descripción: cabida y linderos/);
  });

  it('no pide nada si quedaron transcritos', () => {
    expect(revisarRemisionDeLinderos(plantilla, correcta(), lecturas)).toBeNull();
  });

  it('respeta la plantilla que remite y la falta de escritura con linderos', () => {
    const remite = new Map(plantilla);
    remite.set(25, 'LOTE 14, determinado por su descripción, cabida y linderos, que constan en la escritura pública 2054 de 2021.');
    for (const n of [26, 27, 28]) remite.delete(n);
    expect(revisarRemisionDeLinderos(remite, generada(), lecturas)).toBeNull();
    expect(revisarRemisionDeLinderos(plantilla, generada(), [lecturas[0]])).toBeNull();
  });
});
