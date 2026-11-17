import { describe, expect, it } from 'vitest';
import { difierenEnCeros, mismaCatastral, problemaDeForma, revisarCatastrales, catastralesEn } from '@/lib/escritura/catastral';

// Caso real (EXP-2026-00037): lo impreso y lo que leyó la IA
const CERT = '410010002000000490858000000000';
const PAZ = '0002000000490858000000000';
const CERT_MAL = '410010020000004908580000000000';
const PAZ_MAL = '0002000000049085800000000000';

describe('cédulas catastrales', () => {
  it('la del certificado y la del paz y salvo son la misma sin el 41001', () => {
    expect(mismaCatastral(CERT, PAZ)).toBe(true);
    expect(mismaCatastral(CERT_MAL, PAZ_MAL)).toBe(false);
  });

  it('detecta las que solo difieren en la cantidad de ceros', () => {
    expect(difierenEnCeros(CERT_MAL, PAZ_MAL)).toBe(true);
    expect(difierenEnCeros(CERT, PAZ)).toBe(false);
    expect(difierenEnCeros(CERT, '410010002000000490859000000000')).toBe(false);
  });

  it('revisa la forma', () => {
    expect(problemaDeForma(CERT)).toBeNull();
    expect(problemaDeForma(PAZ)).toBeNull();
    expect(problemaDeForma(PAZ_MAL)).toMatch(/28 dígitos/);
  });

  it('encuentra las cédulas catastrales escritas en la escritura', () => {
    expect(catastralesEn(`CEDULA CATASTRAL: ${CERT}.\nCEDULA CATASTRAL PAZ Y SALVO: ${PAZ}.`)).toEqual([CERT, PAZ]);
  });

  it('avisa lo que no cuadra con los documentos', () => {
    const documentos = [
      { tipo: 'Certificado de tradición y libertad', datos: [{ dato: 'Código catastral (actual)', valor: CERT_MAL, pagina: 3 }, { dato: 'Código catastral anterior', valor: '41001000200060173000', pagina: 3 }] },
      { tipo: 'Paz y salvo de impuesto predial unificado', datos: [{ dato: 'Cédula catastral', valor: PAZ_MAL, pagina: 11 }] },
    ];
    const avisos = revisarCatastrales(`CEDULA CATASTRAL: ${CERT_MAL}.\nCEDULA CATASTRAL PAZ Y SALVO: ${PAZ_MAL}0.`, documentos);
    expect(avisos.some((a) => a.includes('salvo en la cantidad de ceros'))).toBe(true);
    expect(avisos.some((a) => a.includes('28 dígitos'))).toBe(true);
    // La de la escritura con un cero de más no está en ningún documento
    expect(avisos.some((a) => a.includes(`«${PAZ_MAL}0»`))).toBe(true);
    // Bien leídas, sin avisos
    const bien = [
      { tipo: 'Certificado de tradición y libertad', datos: [{ dato: 'Código catastral', valor: CERT, pagina: 3 }] },
      { tipo: 'Paz y salvo de impuesto predial', datos: [{ dato: 'Cédula catastral', valor: PAZ, pagina: 11 }] },
    ];
    expect(revisarCatastrales(`CEDULA CATASTRAL: ${CERT}.`, bien)).toEqual([]);
  });
});
