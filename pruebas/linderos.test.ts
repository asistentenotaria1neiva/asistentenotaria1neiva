import { describe, it, expect } from 'vitest';
import { revisarLinderos, alertasDeLinderosDudosos, MARCA_LINDERO } from '../src/lib/escritura/linderos';
import type { CambioParrafo } from '../src/lib/escritura/docx';

const reescribir = (p: number, texto: string): CambioParrafo => ({ p, accion: 'REESCRIBIR', reemplazos: [], texto, insertar_despues: [] });

// EXP-2026-00037: escaneo borroso; las medidas leídas dan ~1.355 m² y la escritura dice 537.59 m²
const lote = () => [
  reescribir(31, 'LOTE 1 MANZANA E, con área de QUINIENTOS TREINTA Y SIETE PUNTO CINCUENTA Y NUEVE METROS CUADRADOS (537.59 M2), determinado por los siguientes linderos: NORTE: Con la vía pública en longitud de cincuenta y dos punto cero nueve metros (52.09 m).'),
  reescribir(32, 'SUR: Con el lote número 2 de la misma manzana en longitud de cincuenta y cinco punto noventa y siete metros (55.97 m).'),
  reescribir(33, 'ORIENTE: Con el lote número 4 de la misma manzana en longitud de veinticuatro punto sesenta y siete metros (24.67 m).'),
  reescribir(34, 'OCCIDENTE: Con el lote número 22 en longitud de veinticinco punto cincuenta metros (25.50 m).'),
];

describe('revisión de los linderos', () => {
  it('reconoce la alerta de linderos poco legibles', () => {
    expect(alertasDeLinderosDudosos(['Los linderos NORTE, SUR, ORIENTE y OCCIDENTE son de escritura impresa de baja resolución; verificar las medidas contra el original.'])).toHaveLength(1);
    expect(alertasDeLinderosDudosos(['La cédula fue expedida en 1971; verificar contra el original.'])).toHaveLength(0);
    expect(alertasDeLinderosDudosos(['Área y linderos: el certificado da área de 537.59 m2 según decreto; la escritura y la anotación de linderos deben coincidir.'])).toHaveLength(0);
  });

  it('resalta cada costado cuando la lectura los dio por poco legibles', () => {
    const r = revisarLinderos(lote(), ['Los linderos son de escritura impresa de baja resolución; verificar las medidas contra el original.']);
    expect(r.cambios.every((c) => c.texto.includes(MARCA_LINDERO))).toBe(true);
    expect(r.advertencias.some((a) => a.nivel === 'CRITICA')).toBe(true);
  });

  it('resalta los linderos que no cuadran con el área aunque no haya alerta', () => {
    const r = revisarLinderos(lote(), []);
    expect(r.cambios.every((c) => /\[VERIFICAR: las medidas de los linderos no cuadran/.test(c.texto))).toBe(true);
    expect(r.advertencias[0].detalle).toMatch(/1355 m²/);
  });

  it('no toca linderos legibles que cuadran con el área', () => {
    const cambios = [
      reescribir(10, 'con área de CIENTO TREINTA Y CINCO PUNTO SETENTA Y CUATRO METROS CUADRADOS (135.74 M2), determinado por los siguientes linderos: NORTE: Con el predio de ARLEY en longitud de ocho punto cincuenta y tres metros (8.53 m).'),
      reescribir(11, 'SUR: Con la calle 5 en longitud de nueve punto cuarenta y seis metros (9.46 m).'),
      reescribir(12, 'ORIENTE: Con el predio de INGRID en longitud de quince punto diez metros (15.10 m).'),
      reescribir(13, 'OCCIDENTE: Con el predio de MARLY en longitud de quince punto diez metros (15.10 m).'),
    ];
    const r = revisarLinderos(cambios, ['La cédula fue expedida en 1971; verificar contra el original.']);
    expect(r.cambios).toBe(cambios);
    expect(r.advertencias).toEqual([]);
  });

  it('no repite la marca si la redacción ya puso [VERIFICAR]', () => {
    const cambios = lote();
    cambios[1].texto += ' [VERIFICAR: cifra poco legible]';
    const r = revisarLinderos(cambios, ['Linderos borrosos en la página 15.']);
    expect(r.cambios[1].texto.match(/\[VERIFICAR/g)).toHaveLength(1);
  });
});
