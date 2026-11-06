/**
 * Precios de la API de Claude por millón de tokens (USD), tarifa estándar de Anthropic.
 * - cache: leer de la caché (≈10 % de la entrada).
 * - La escritura de caché (5 minutos) cuesta 1,25 × la entrada.
 * - Haiku 5.5 cobra más cuando el prompt supera 100.000 tokens ($0,50 / $2,50).
 * Si Anthropic cambia los precios, se ajustan aquí; cada registro de consumo guarda el costo con
 * el precio vigente cuando se hizo la llamada.
 */
type Precio = { entrada: number; salida: number; cache: number };

export const PRECIOS_MODELOS: Record<string, Precio> = {
  'claude-fable-5-1': { entrada: 10, salida: 50, cache: 0.25 },
  'claude-fable-5': { entrada: 10, salida: 50, cache: 1 },
  'claude-opus-5-5': { entrada: 4, salida: 20, cache: 0.2 },
  'claude-opus-5': { entrada: 5, salida: 25, cache: 0.5 },
  'claude-opus-4-8': { entrada: 5, salida: 25, cache: 0.5 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10, cache: 0.2 },
  'claude-sonnet-5': { entrada: 2, salida: 10, cache: 0.2 },
  'claude-sonnet-4-6': { entrada: 3, salida: 15, cache: 0.3 },
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5, cache: 0.01 },
  'claude-haiku-4-5': { entrada: 1, salida: 5, cache: 0.1 },
};

const HAIKU_LARGO: Precio = { entrada: 0.5, salida: 2.5, cache: 0.05 };
const FACTOR_ESCRITURA_CACHE = 1.25;

function precioDe(modelo: string, promptTotal: number): Precio {
  if (modelo.startsWith('claude-haiku-5-5') && promptTotal > 100_000) return HAIKU_LARGO;
  // Un modelo desconocido se estima al precio de Opus (sobreestima antes que ocultar el gasto)
  return PRECIOS_MODELOS[modelo] ?? PRECIOS_MODELOS[Object.keys(PRECIOS_MODELOS).find((k) => modelo.startsWith(k)) ?? 'claude-opus-5-5'];
}

/** Costo en USD de una llamada (tokens de entrada sin caché, salida, lectura y escritura de caché) */
export function costoEstimadoUSD(modelo: string, entrada: number, salida: number, cacheLectura: number, cacheEscritura = 0): number {
  const p = precioDe(modelo, entrada + cacheLectura + cacheEscritura);
  return (entrada * p.entrada + salida * p.salida + cacheLectura * p.cache + cacheEscritura * p.entrada * FACTOR_ESCRITURA_CACHE) / 1_000_000;
}
