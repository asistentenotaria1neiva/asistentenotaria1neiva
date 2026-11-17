import { describe, it, expect } from 'vitest';
import { discordanciasDeGenero, describirDiscordancias } from '../src/lib/escritura/genero';
import type { Otorgante } from '../src/lib/ia/instrucciones';

const ALIRIO: Otorgante = { nombre: 'ALIRIO VASQUEZ RAMIREZ', documento: '7.691.630', papel: 'VENDEDOR', genero: 'HOMBRE' };
const LENEY: Otorgante = { nombre: 'LENEY FERNANDEZ VELEZ', documento: '1.075.000.000', papel: 'COMPRADORA', genero: 'MUJER' };

describe('concordancia de género con cada persona', () => {
  it('señala a un hombre descrito en femenino (lo que quedó de la plantilla)', () => {
    const p = 'Compareció quien dijo ser, ALIRIO VASQUEZ RAMIREZ, mayor de edad, domiciliada en la ciudad de Neiva (H), identificada con cedula de ciudadanía número 7.691.630 expedida en Neiva, estado civil SOLTERO SIN UNION MARITAL DE HECHO, actividad económica INDEPENDIENTE, y manifestó:';
    const d = discordanciasDeGenero(p, [ALIRIO, LENEY]);
    expect(d.map((x) => x.palabra)).toEqual(['domiciliada', 'identificada']);
    expect(describirDiscordancias(d)[0]).toContain('ALIRIO VASQUEZ RAMIREZ es un hombre');
  });

  it('no señala «expedida» (concuerda con la cédula) ni lo que está bien', () => {
    const p = 'Compareció quien dijo ser, ALIRIO VASQUEZ RAMIREZ, mayor de edad, domiciliado en Neiva (H), identificado con cédula 7.691.630 expedida en Neiva, estado civil SOLTERO SIN UNION MARITAL DE HECHO, y manifestó:';
    expect(discordanciasDeGenero(p, [ALIRIO, LENEY])).toEqual([]);
  });

  it('cada persona con sus propias palabras, aunque estén en el mismo párrafo', () => {
    const p = 'PRIMERO: Que el señor ALIRIO VASQUEZ RAMIREZ transfiere en venta a quien dijo ser, LENEY FERNANDEZ VELEZ, mayor de edad, domiciliada en Neiva (H), identificada con cédula 1.075.000.000, estado civil SOLTERA SIN UNION MARITAL DE HECHO';
    expect(discordanciasDeGenero(p, [ALIRIO, LENEY])).toEqual([]);
    const mal = 'PRIMERO: Que la señora ALIRIO VASQUEZ RAMIREZ transfiere en venta a quien dijo ser, LENEY FERNANDEZ VELEZ, mayor de edad, domiciliado en Neiva (H)';
    const d = discordanciasDeGenero(mal, [ALIRIO, LENEY]);
    expect(d.map((x) => `${x.nombre}: ${x.palabra}`)).toEqual(['ALIRIO VASQUEZ RAMIREZ: la señora', 'LENEY FERNANDEZ VELEZ: domiciliado']);
  });

  it('sin género conocido (versiones anteriores) no revisa nada', () => {
    const p = 'ALIRIO VASQUEZ RAMIREZ, mayor de edad, domiciliada en Neiva';
    expect(discordanciasDeGenero(p, [{ ...ALIRIO, genero: undefined }])).toEqual([]);
  });
});
