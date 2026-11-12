import { describe, expect, it } from 'vitest';
import { costoEstimadoUSD } from '../src/lib/ia/precios';

describe('costo de la IA', () => {
  it('cobra entrada, salida, lectura y escritura de caché', () => {
    // Sonnet 5.5: 1M entrada ($2) + 1M salida ($10) + 1M caché leída ($0,20) + 1M caché escrita ($2,50)
    expect(costoEstimadoUSD('claude-sonnet-5-5', 1_000_000, 1_000_000, 1_000_000, 1_000_000)).toBeCloseTo(14.7);
  });
  it('aplica la tarifa larga de Haiku 5.5 por encima de 100.000 tokens de prompt', () => {
    expect(costoEstimadoUSD('claude-haiku-5-5', 50_000, 1_000, 0)).toBeCloseTo(0.0055);
    expect(costoEstimadoUSD('claude-haiku-5-5', 200_000, 1_000, 0)).toBeCloseTo(0.1025);
  });
  it('estima un modelo desconocido al precio de Opus 5.5', () => {
    expect(costoEstimadoUSD('modelo-nuevo', 1_000_000, 0, 0)).toBe(4);
  });
  it('la escritura de caché de una hora cuesta el doble de la entrada (la de 5 minutos, 1,25 veces)', () => {
    // Sonnet 5.5: entrada $2 por millón; 1M escrito, la mitad por una hora
    expect(costoEstimadoUSD('claude-sonnet-5-5', 0, 0, 0, 1_000_000, 500_000)).toBeCloseTo(0.5 * 2 * 1.25 + 0.5 * 2 * 2);
  });
});
