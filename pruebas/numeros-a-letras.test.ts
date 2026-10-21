import { describe, expect, it } from 'vitest';
import {
  enteroALetras, pesosEnLetras, medidaEnLetras, fechaEnLetras, fechaComparecencia,
  numeroEscrituraEnLetras, porcentajeEnLetras, formatoPesos,
} from '@/lib/texto/numeros-a-letras';

// Vectores tomados de escrituras reales de la notaría (solo cifras, sin datos personales)
describe('pesos en letras (estilo de la notaría)', () => {
  it.each([
    [100_000_000, 'CIEN MILLONES DE PESOS M/CTE ($100.000.000)'],
    [42_200_000, 'CUARENTA Y DOS MILLONES DOSCIENTOS MIL PESOS M/CTE ($42.200.000)'],
    [168_800_000, 'CIENTO SESENTA Y OCHO MILLONES OCHOCIENTOS MIL PESOS M/CTE ($168.800.000)'],
    [211_000_000, 'DOSCIENTOS ONCE MILLONES DE PESOS M/CTE ($211.000.000)'],
    [1_000_000, 'UN MILLON DE PESOS M/CTE ($1.000.000)'],
    [101_518_350, 'CIENTO UN MILLONES QUINIENTOS DIECIOCHO MIL TRESCIENTOS CINCUENTA PESOS M/CTE ($101.518.350)'],
    [1_430_035_500, 'MIL CUATROCIENTOS TREINTA MILLONES TREINTA Y CINCO MIL QUINIENTOS PESOS M/CTE ($1.430.035.500)'],
    [21_000, 'VEINTIUN MIL PESOS M/CTE ($21.000)'],
    [2_000_000_000, 'DOS MIL MILLONES DE PESOS M/CTE ($2.000.000.000)'],
    [1, 'UN PESO M/CTE ($1)'],
  ])('%i', (valor, esperado) => {
    expect(pesosEnLetras(valor)).toBe(esperado);
  });

  it('con tildes cuando se configura', () => {
    expect(pesosEnLetras(26_000_000, { tildes: true })).toBe('VEINTISÉIS MILLONES DE PESOS M/CTE ($26.000.000)');
    expect(enteroALetras(1_000_000, { tildes: true })).toBe('UN MILLÓN');
  });

  it('rechaza valores no válidos', () => {
    expect(() => pesosEnLetras(-5)).toThrow();
    expect(() => pesosEnLetras(10.5)).toThrow();
  });

  it('formato de pesos', () => {
    expect(formatoPesos(35_260_000)).toBe('$35.260.000');
  });
});

describe('enteros', () => {
  it('forma plena y apócope', () => {
    expect(enteroALetras(21, { apocope: false })).toBe('VEINTIUNO');
    expect(enteroALetras(21)).toBe('VEINTIUN');
    expect(enteroALetras(31, { apocope: false })).toBe('TREINTA Y UNO');
    expect(enteroALetras(100)).toBe('CIEN');
    expect(enteroALetras(101)).toBe('CIENTO UN');
    expect(enteroALetras(1000)).toBe('MIL');
    expect(enteroALetras(2026, { apocope: false })).toBe('DOS MIL VEINTISEIS');
  });
});

describe('número de escritura', () => {
  it('con separador de miles', () => {
    expect(numeroEscrituraEnLetras(2616)).toBe('DOS MIL SEISCIENTOS DIECISEIS (2.616)');
    expect(numeroEscrituraEnLetras(2155, { separadorMiles: false })).toBe('DOS MIL CIENTO CINCUENTA Y CINCO (2155)');
    expect(numeroEscrituraEnLetras(76)).toBe('SETENTA Y SEIS (76)');
  });
});

describe('fechas', () => {
  it('fecha de otorgamiento', () => {
    expect(fechaEnLetras('2026-08-04')).toBe('CUATRO (04) DE AGOSTO DE DOS MIL VEINTISEIS (2026)');
    expect(fechaEnLetras('2026-06-01')).toBe('PRIMERO (01) DE JUNIO DE DOS MIL VEINTISEIS (2026)');
    expect(fechaEnLetras('2026-07-31')).toBe('TREINTA Y UNO (31) DE JULIO DE DOS MIL VEINTISEIS (2026)');
  });
  it('fórmula de comparecencia', () => {
    expect(fechaComparecencia('2026-08-04')).toBe('a los CUATRO (04) DÍAS del mes de AGOSTO del año DOS MIL VEINTISEIS (2026)');
    expect(fechaComparecencia('2026-07-31')).toBe('a los TREINTA Y UN (31) DÍAS del mes de JULIO del año DOS MIL VEINTISEIS (2026)');
    expect(fechaComparecencia('2026-06-01')).toBe('al PRIMER (01) DÍA del mes de JUNIO del año DOS MIL VEINTISEIS (2026)');
  });
  it('rechaza fechas inexistentes', () => {
    expect(() => fechaEnLetras('2026-02-30')).toThrow();
  });
});

describe('medidas', () => {
  it('áreas', () => {
    expect(medidaEnLetras(97.5, 'METROS CUADRADOS', 'M2')).toBe('NOVENTA Y SIETE PUNTO CINCUENTA METROS CUADRADOS (97.50 M2)');
    expect(medidaEnLetras(132, 'METROS CUADRADOS', 'M2')).toBe('CIENTO TREINTA Y DOS METROS CUADRADOS (132.00 M2)');
  });
  it('longitudes en linderos (minúsculas)', () => {
    expect(medidaEnLetras(6.5, 'metros', 'm', { minusculas: true })).toBe('seis punto cincuenta metros (6.50 m)');
    expect(medidaEnLetras(0.15, 'metros', 'm', { minusculas: true })).toBe('cero punto quince metros (0.15 m)');
    expect(medidaEnLetras(1, 'metros', 'm', { minusculas: true })).toBe('un metro (1.00 m)');
    expect(medidaEnLetras(2.05, 'metros', 'm', { minusculas: true })).toBe('dos punto cero cinco metros (2.05 m)');
  });
});

describe('porcentajes', () => {
  it('con decimales', () => {
    expect(porcentajeEnLetras(12.5)).toBe('DOCE PUNTO CINCO POR CIENTO (12.5%)');
    expect(porcentajeEnLetras(94.64)).toBe('NOVENTA Y CUATRO PUNTO SESENTA Y CUATRO POR CIENTO (94.64%)');
    expect(porcentajeEnLetras(50)).toBe('CINCUENTA POR CIENTO (50%)');
  });
});
