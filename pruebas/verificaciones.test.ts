import { describe, it, expect } from 'vitest';
import { medidasSinLetras, medidasPorRevisar, medidasEnLetras } from '../src/lib/escritura/verificaciones';

describe('medidas de los linderos en letras y en cifras', () => {
  it('acepta las medidas escritas como en las plantillas', () => {
    expect(medidasSinLetras('NORTE: Con el lote 26 en una distancia de seis metros (6.00 m).')).toEqual([]);
    expect(medidasSinLetras('SURORIENTE: Con circulación interna en línea quebrada de siete punto cuarenta y seis metros lineales (7.46 ml) del punto 46.')).toEqual([]);
    expect(medidasSinLetras('con área de SETENTA Y DOS METROS CUADRADOS (72.00 M2), junto con la casa')).toEqual([]);
    expect(medidasSinLetras('ORIENTE: Continuamos del mojón 4, hasta el mojón 61, ubicado sobre las coordenadas NORTE 818209.01, ESTE 8605789.13, y una distancia de veintidós metros (22.00 m) colindando con lote 4.')).toEqual([]);
    expect(medidasSinLetras('en una distancia de veintiún metros (21.00 m)')).toEqual([]);
    expect(medidasSinLetras('en una distancia de seis punto cinco metros (6.5 m)')).toEqual([]);
  });

  it('señala la medida copiada del certificado solo en cifras', () => {
    expect(medidasSinLetras('NORTE: EN 6.00 MTS CON LOTE 26')).toHaveLength(1);
    expect(medidasSinLetras('NORTE: Con el lote 26 en una distancia de (6.00 m).')).toHaveLength(1);
  });

  it('señala las letras que no corresponden a la cifra', () => {
    const r = medidasSinLetras('NORTE: Con el lote 26 en una distancia de siete metros (6.00 m).');
    expect(r).toHaveLength(1);
    expect(r[0]).toContain('SEIS');
  });

  it('revisa los linderos y deja las medidas que la plantilla escribe en cifras fuera de los linderos', () => {
    // Lindero nuevo copiado en cifras: se señala aunque la plantilla también lo tuviera en cifras
    expect(medidasPorRevisar('ORIENTE: Colindando con casa vecina N 16, con distancia de 6.00 metros.', 'ORIENTE: Colindando con casa vecina N 20, con distancia de 7.10 metros.')).toHaveLength(1);
    // Un nivel o altura que la plantilla trae en cifras no se señala
    expect(medidasPorRevisar('APARTAMENTO 202, TORRE G, Nivel 2.40 m, se ingresa', 'APARTAMENTO 305, TORRE B, Nivel 5.20 m, se ingresa')).toEqual([]);
    // Lo que ya estaba igual en la plantilla no se señala
    expect(medidasPorRevisar('MANZANA J: área de 1652 M2. SUR: Colindando', 'MANZANA J: área de 1652 M2. SUR: Colindando')).toEqual([]);
  });

  it('arma las advertencias con el párrafo', () => {
    const plantilla = new Map([[5, 'NORTE: Con el lote 26 en una distancia de seis metros (6.00 m).']]);
    const r = medidasEnLetras(plantilla, new Map([[5, 'NORTE: EN 8 MTS CON LA CALLE 32\nSUR: Con el lote 3 en una distancia de ocho metros (8.00 m).']]));
    expect(r).toHaveLength(1);
    expect(r[0].p).toBe(5);
  });
});
