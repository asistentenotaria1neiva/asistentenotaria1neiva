import { describe, it, expect } from 'vitest';
import { expandirNomenclatura as x } from '../src/lib/escritura/nomenclatura';

describe('dirección completa en la escritura', () => {
  it('completa las vías y el signo de número', () => {
    expect(x('CLL 5 # 10-20')).toBe('CALLE 5 NÚMERO 10-20');
    expect(x('CL. 21 SUR No. 3-45')).toBe('CALLE 21 SUR NÚMERO 3-45');
    expect(x('KR 7A BIS N° 12 - 30')).toBe('CARRERA 7A BIS NÚMERO 12 - 30');
    expect(x('CRA 1C #8-15')).toBe('CARRERA 1C NÚMERO 8-15');
    expect(x('AV 26 NRO 69-76')).toBe('AVENIDA 26 NÚMERO 69-76');
    expect(x('DG 10 # 4-12 Y TV 5 # 3-1')).toBe('DIAGONAL 10 NÚMERO 4-12 Y TRANSVERSAL 5 NÚMERO 3-1');
    expect(x('AK 15 # 80-12')).toBe('AVENIDA CARRERA 15 NÚMERO 80-12');
  });

  it('completa manzana, lote, casa, apartamento, barrio y urbanización', () => {
    expect(x('MZ 3 LT 4 URB LOS ALAMOS')).toBe('MANZANA 3 LOTE 4 URBANIZACIÓN LOS ALAMOS');
    expect(x('MZ B CS 12 BRR. CANDIDO')).toBe('MANZANA B CASA 12 BARRIO CANDIDO');
    expect(x('APTO 301 TO 2 CONJ RESERVA DEL RIO')).toBe('APARTAMENTO 301 TORRE 2 CONJUNTO RESERVA DEL RIO');
    expect(x('LOTE KM 5 VDA EL TRIUNFO')).toBe('LOTE KILÓMETRO 5 VEREDA EL TRIUNFO');
  });

  it('respeta las minúsculas', () => {
    expect(x('ubicado en la Cll 5 # 10-20')).toBe('ubicado en la Calle 5 número 10-20');
  });

  it('no toca lo que no es una dirección', () => {
    const textos = [
      'Escritura Pública No. 1234 del 5 de mayo',
      'identificado con C.C. No. 12.345.678',
      'CALLE 5 NÚMERO 10-20',
      'ORIENTE: hasta el mojón 61, coordenadas NORTE 818209.01, ESTE 8605789.13',
      'la CLAUSULA 5 y la cláusula PRIMERA',
      'matrícula inmobiliaria No. 200-12345',
    ];
    for (const t of textos) expect(x(t)).toBe(t);
  });
});
