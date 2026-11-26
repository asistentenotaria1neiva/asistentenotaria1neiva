import { describe, it, expect } from 'vitest';
import { revisarAccesoDeLotes, esDivision } from '../src/lib/escritura/acceso-lotes';

const escritura = (lotes: string[], extra = '') => [
  'ACTO: SUBDIVISIÓN',
  'Lote de terreno denominado LOTE GRANDE, de mayor extensión, determinado por los siguientes linderos:',
  'NORTE: Con la vía a Tello en 100 m. SUR: Con JUAN PÉREZ en 100 m. ORIENTE: Con el río en 50 m. OCCIDENTE: Con PEDRO GÓMEZ en 50 m.',
  'TERCERO: Que a continuación procede a SUBDIVIDIR dicho inmueble, del cual surgen dos (2) lotes autónomos, alinderados así:',
  ...lotes,
  extra,
].join('\n');

const LOTE_CON_VIA = ['1. Lote de terreno denominado LOTE A, determinado por los siguientes linderos:', 'POR EL NORTE: Con la vía a Tello en 50 m.', 'POR EL SUR: Con el LOTE B en 50 m.', 'POR EL ORIENTE: Con el río en 20 m.', 'POR EL OCCIDENTE: Con PEDRO GÓMEZ en 20 m.'];
const LOTE_ENCERRADO = ['2. Lote de terreno denominado LOTE B, determinado por los siguientes linderos:', 'POR EL NORTE: Con el LOTE A en 50 m.', 'POR EL SUR: Con JUAN PÉREZ en 50 m.', 'POR EL ORIENTE: Con el río en 30 m.', 'POR EL OCCIDENTE: Con PEDRO GÓMEZ en 30 m.'];

describe('acceso de los lotes de una división (Decreto 1077 de 2015)', () => {
  it('un lote resultante sin vía ni servidumbre es crítica, con su nombre', () => {
    const a = revisarAccesoDeLotes(escritura([...LOTE_CON_VIA, ...LOTE_ENCERRADO]), { esDivision: true });
    expect(a).toHaveLength(1);
    expect(a[0].nivel).toBe('CRITICA');
    expect(a[0].detalle).toContain('LOTE B');
    expect(a[0].detalle).not.toContain('LOTE A');
    expect(a[0].detalle).toContain('Decreto 1077 de 2015');
  });

  it('el predio de mayor extensión (antes de la división) no cuenta', () => {
    expect(revisarAccesoDeLotes(escritura(LOTE_CON_VIA), { esDivision: true })).toEqual([]);
  });

  it('con servidumbre de tránsito constituida queda como advertencia para confirmarla', () => {
    const a = revisarAccesoDeLotes(escritura([...LOTE_CON_VIA, ...LOTE_ENCERRADO], 'CUARTO: Se constituye servidumbre de tránsito a favor del LOTE B sobre el LOTE A.'), { esDivision: true });
    expect(a).toHaveLength(1);
    expect(a[0].nivel).toBe('ADVERTENCIA');
  });

  it('la línea «ACCESO VIAL» con una vía cuenta; con «FALTA» no', () => {
    const conAcceso = [...LOTE_ENCERRADO, 'ACCESO VIAL: Por la vía veredal que conduce a San Andrés.'];
    expect(revisarAccesoDeLotes(escritura([...LOTE_CON_VIA, ...conAcceso]), { esDivision: true })).toEqual([]);
    const sinDato = [...LOTE_ENCERRADO, 'ACCESO VIAL: «FALTA: vía de acceso del LOTE B».'];
    expect(revisarAccesoDeLotes(escritura([...LOTE_CON_VIA, ...sinDato]), { esDivision: true })[0].nivel).toBe('CRITICA');
  });

  it('linderos incompletos (solo dos costados) también se revisan', () => {
    const incompleto = ['2. Lote de terreno denominado LOTE B, determinado por los siguientes linderos:', 'LINDERO 1. NORTE: Con el LOTE A en 50 m.', 'LINDERO 2. ORIENTE: Con el río en 30 m.'];
    expect(revisarAccesoDeLotes(escritura([...LOTE_CON_VIA, ...incompleto]), { esDivision: true })[0].detalle).toContain('LOTE B');
  });

  it('no revisa lo que no es una división', () => {
    expect(revisarAccesoDeLotes(escritura([...LOTE_CON_VIA, ...LOTE_ENCERRADO]), { esDivision: false })).toEqual([]);
  });
});

describe('qué escrituras son divisiones', () => {
  it('por la categoría de la plantilla', () => {
    expect(esDivision({ categoria: 'DESENGLOBE' })).toBe(true);
    expect(esDivision({ categoria: 'PARCELACION' })).toBe(true);
    expect(esDivision({ categoria: 'COMPRAVENTA' })).toBe(false);
  });
  it('por las indicaciones o la carátula', () => {
    expect(esDivision({ categoria: 'COMPRAVENTA', observaciones: 'Tener en cuenta que es subdivisión' })).toBe(true);
    expect(esDivision({ categoria: 'COMPRAVENTA', caratula: 'NATURALEZA DEL ACTO: DIVISIÓN MATERIAL' })).toBe(true);
  });
  it('una compraventa de un lote que salió de un desenglobe anterior no es división', () => {
    expect(esDivision({ categoria: 'COMPRAVENTA', plantilla: 'URBANO - COMPRAVENTA', caratula: 'ACTO: COMPRAVENTA' })).toBe(false);
  });
});
