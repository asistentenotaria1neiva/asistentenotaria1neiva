import { describe, expect, it } from 'vitest';
import { referenciasInternas, sinCambiosEnReferencias } from '../src/lib/escritura/cierre';
import type { CambioParrafo } from '../src/lib/escritura/docx';

// Cierre de la plantilla «23 - MARIO MEDINA - DR. JAIRO - INDAGACION» (EXP-2026-00060)
const plantilla = new Map<number, string>([
  [81, 'El anterior instrumento quedó elaborado en las hojas de papel notarial números:'],
  [85, 'De lo cual doy fe.'],
  [86, 'DERECHOS NOTARIALES: 633.867 IVA: 211.768,87 FONDO: 21.850 SUPER: 21.850'],
  [87, 'RETEFUENTE: SEGÚN RECIBO No. 1928 POR VALOR DE $1.245.000.'],
  [88, 'Resolución No. 2026-000964-6 del 20 de Enero de 2026.'],
  [89, 'La presente escritura fue autorizada para otorgarse en diferentes momentos Art. 9 Decreto 2148/1983.'],
  [90, 'HIPOTECA BBVA 23/ MILAN.'],
  [92, 'LOS OTORGANTES,'],
]);

const cambio = (p: number, original: string, nuevo: string): CambioParrafo => ({ p, accion: 'REEMPLAZAR', reemplazos: [{ original, nuevo }], texto: '', insertar_despues: [] });

describe('referencia interna del cierre', () => {
  it('reconoce solo el renglón de control, no el decreto', () => {
    expect(referenciasInternas(plantilla)).toEqual([90]);
  });

  it('descarta el cambio copiado de otra escritura y deja los demás', () => {
    const cambios = [cambio(87, '1928', '«EN BLANCO»'), cambio(90, '23/ MILAN.', 'TATIANA/Sucesiones/2026/0001.')];
    expect(sinCambiosEnReferencias(cambios, plantilla, '').map((c) => c.p)).toEqual([87]);
  });

  it('lo permite si las observaciones piden cambiar la referencia', () => {
    const cambios = [cambio(90, 'MILAN', 'TATIANA')];
    expect(sinCambiosEnReferencias(cambios, plantilla, 'La referencia interna va con TATIANA')).toHaveLength(1);
  });
});
