import { describe, it, expect } from 'vitest';
import { ubicarAproximado } from '@/lib/escritura/docx';

const PARRAFO = 'LOTE 2, ubicado en la CALLE 5 NÚMERO 8-84 - BARRIO LA PORTADA, en el Municipio de Tello, Departamento del Huila, con área de CIENTO TREINTA Y CINCO PUNTO SETENTA Y CUATRO METROS CUADRADOS (135.74 M2), determinado por los siguientes linderos: ----------';
const BIEN = 'CIENTO TREINTA Y CINCO PUNTO SETENTA Y CUATRO METROS CUADRADOS (135.74 M2)';

describe('ubicarAproximado (fragmento copiado casi igual por la IA)', () => {
  it('ubica el área aunque la IA escribió SIETE en vez de CINCO (EXP-2026-00077)', () => {
    const r = ubicarAproximado(PARRAFO, 'CIENTO TREINTA Y SIETE PUNTO SETENTA Y CUATRO METROS CUADRADOS (135.74 M2)');
    expect(r).not.toBeNull();
    expect(PARRAFO.slice(r!.inicio, r!.fin)).toBe(BIEN);
  });

  it('no reemplaza si las cifras no son las mismas', () => {
    expect(ubicarAproximado(PARRAFO, 'CIENTO TREINTA Y CINCO PUNTO SETENTA Y CUATRO METROS CUADRADOS (135.75 M2)')).toBeNull();
  });

  it('no reemplaza fragmentos cortos ni muy distintos', () => {
    expect(ubicarAproximado(PARRAFO, 'CALLE 6 NÚMERO 8-84')).toBeNull();
    expect(ubicarAproximado(PARRAFO, 'SEISCIENTOS OCHENTA METROS LINEALES DE FRENTE (135.74 M2)')).toBeNull();
  });

  it('no reemplaza si hay dos tramos igual de parecidos', () => {
    const doble = `${BIEN} y también ${BIEN}`;
    expect(ubicarAproximado(doble, 'CIENTO TREINTA Y SIETE PUNTO SETENTA Y CUATRO METROS CUADRADOS (135.74 M2)')).toBeNull();
  });
});
