import { describe, expect, it } from 'vitest';
import {
  validarCedula, validarNit, digitoVerificacionNit, validarMatricula, validarCedulaCatastral,
  validarFecha, validarValor, validarNombre, validarMedida, validarPorcentaje, validarDocumento,
} from '@/lib/validaciones/formatos';

describe('cédula', () => {
  it('normaliza con puntos de miles', () => {
    expect(validarCedula('1075311992')).toEqual({ ok: true, normalizado: '1.075.311.992' });
    expect(validarCedula('9.620.323').normalizado).toBe('9.620.323');
  });
  it('rechaza formatos no válidos', () => {
    expect(validarCedula('').ok).toBe(false);
    expect(validarCedula('12A45').ok).toBe(false);
    expect(validarCedula('12').ok).toBe(false);
    expect(validarCedula('12345678901').ok).toBe(false);
    expect(validarCedula('0123456').ok).toBe(false);
  });
});

describe('NIT con dígito de verificación (algoritmo DIAN)', () => {
  // NIT públicos de entidades que aparecen en las escrituras
  it.each([
    ['860.002.964-4'], // Banco de Bogotá
    ['890.903.938-8'], // Bancolombia
    ['860.003.020-1'], // BBVA Colombia
    ['860.034.313-7'], // Davivienda
    ['800.037.800-8'], // Banco Agrario
    ['860.007.335-4'], // Banco Caja Social
    ['800.155.413-6'], // Acción Fiduciaria
  ])('%s es válido', (nit) => {
    expect(validarNit(nit)).toEqual({ ok: true, normalizado: nit });
  });
  it('detecta dígito de verificación errado', () => {
    const r = validarNit('860.002.964-5');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('debe ser 4');
  });
  it('calcula el DV', () => {
    expect(digitoVerificacionNit('860002964')).toBe(4);
  });
  it('acepta sin puntos y sin guion', () => {
    expect(validarNit('8600029644').normalizado).toBe('860.002.964-4');
  });
});

describe('matrícula inmobiliaria', () => {
  it.each(['200-3626', '204-6785', '50C-1513366', '206-105916'])('%s válida', (m) => {
    expect(validarMatricula(m).ok).toBe(true);
  });
  it.each(['200 3626', '2003626', 'ABC-123', '200-'])('%s no válida', (m) => {
    expect(validarMatricula(m).ok).toBe(false);
  });
});

describe('cédula catastral', () => {
  it('acepta 15, 20, 25 y 30 dígitos', () => {
    expect(validarCedulaCatastral('040001380001000').ok).toBe(true);
    expect(validarCedulaCatastral('41524040000980022000').ok).toBe(true);
    expect(validarCedulaCatastral('0105000003460008000000000').ok).toBe(true);
    expect(validarCedulaCatastral('410010105000003460008000000000').ok).toBe(true);
  });
  it('detecta un dígito omitido (caso real de 28 dígitos)', () => {
    const r = validarCedulaCatastral('4100108000005010901900000130');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('28 dígitos');
  });
});

describe('fechas, valores y medidas', () => {
  it('fecha', () => {
    expect(validarFecha('2026-02-29').ok).toBe(false);
    expect(validarFecha('2024-02-29').ok).toBe(true);
    expect(validarFecha('2027-01-01', { noFutura: true, hoy: new Date(2026, 9, 19) }).ok).toBe(false);
  });
  it('valor', () => {
    expect(validarValor('$100.000.000').normalizado).toBe('100000000');
    expect(validarValor('0').ok).toBe(false);
    expect(validarValor('10,5').ok).toBe(false);
  });
  it('medida y porcentaje', () => {
    expect(validarMedida('97,50').normalizado).toBe('97.50');
    expect(validarPorcentaje('94.64%').ok).toBe(true);
    expect(validarPorcentaje('120').ok).toBe(false);
  });
  it('nombre', () => {
    expect(validarNombre('  maria   de los angeles  ').normalizado).toBe('MARIA DE LOS ANGELES');
    expect(validarNombre('JUAN').ok).toBe(false);
  });
  it('documento por tipo', () => {
    expect(validarDocumento('NUIP', '1075809381').ok).toBe(true);
    expect(validarDocumento('NIT', '860.002.964-4').ok).toBe(true);
  });
});
