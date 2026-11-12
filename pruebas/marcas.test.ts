import { describe, it, expect } from 'vitest';
import { normalizarMarcas, runsDe, faltantesEn, EN_BLANCO } from '../src/lib/escritura/docx';

describe('datos que el digitador llena a mano («EN BLANCO»)', () => {
  it('lleva las variantes de la marca a una sola forma', () => {
    expect(normalizarMarcas('la suma de [EN BLANCO] PESOS ($«BLANCO»)')).toBe(`la suma de ${EN_BLANCO} PESOS ($${EN_BLANCO})`);
    expect(normalizarMarcas('Derechos notariales: $«EN BLANCO: derechos»')).toBe(`Derechos notariales: $${EN_BLANCO}`);
    // Un texto común entre paréntesis no se toca
    expect(normalizarMarcas('pintura (blanco y negro)')).toBe('pintura (blanco y negro)');
  });

  it('en el Word va una raya resaltada, sin la palabra y sin contar como «FALTA»', () => {
    const xml = runsDe('', 'la suma de «EN BLANCO» PESOS');
    expect(xml).toContain('____________________');
    expect(xml).not.toContain('EN BLANCO');
    expect(xml).toContain('w:highlight');
    expect(faltantesEn('la suma de «EN BLANCO» PESOS')).toEqual([]);
  });
});

describe('zona de firmas', () => {
  it('deja vacíos los rótulos de firma, como en las plantillas', async () => {
    const { limpiarZonaFirmas, inicioZonaFirmas } = await import('../src/lib/escritura/docx');
    expect(limpiarZonaFirmas('C.C. No. «EN BLANCO»')).toBe('C.C. No.');
    expect(limpiarZonaFirmas('Estado Civil: «FALTA: estado civil»')).toBe('Estado Civil:');
    expect(limpiarZonaFirmas('Teléfono: ______________')).toBe('Teléfono:');
    expect(limpiarZonaFirmas('ERICK ROJAS CAMACHO\nC.C. No. «EN BLANCO»\nEstado Civil:')).toBe('ERICK ROJAS CAMACHO\nC.C. No.\nEstado Civil:');
    // Lo que la plantilla trae con espacios o rayas cortas no se toca
    expect(limpiarZonaFirmas('Persona expuesta políticamente (Decreto 830 de 2021): SI ____ NO ____')).toBe('Persona expuesta políticamente (Decreto 830 de 2021): SI ____ NO ____');
    expect(limpiarZonaFirmas('Fecha de vinculación: día (       ) mes (       ) año (        ).')).toBe('Fecha de vinculación: día (       ) mes (       ) año (        ).');
    const parrafos = ['COMPARECIERON…', 'cláusulas', 'De lo cual doy fe.', 'LOS OTORGANTES,', 'TERESA GARCIA', 'C.C. No.'].map((texto, i) => ({ n: i + 1, texto }));
    expect(inicioZonaFirmas(parrafos)).toBe(4);
  });
});
