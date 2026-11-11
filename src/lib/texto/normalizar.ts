/** Texto para comparar y buscar: mayúsculas, sin tildes y con los espacios simples (la Ñ se conserva) */
export function normalizar(t: string): string {
  return t
    .replace(/ñ/g, '\u0001').replace(/Ñ/g, '\u0001')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'Ñ')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palabras de una búsqueda (cada una debe aparecer, en cualquier orden) */
export const terminosBusqueda = (q: string) => normalizar(q).split(' ').filter((x) => x.length > 0).slice(0, 8);

/** Solo los dígitos (para comparar cédulas, matrículas y valores escritos con o sin puntos) */
export const digitos = (t: string) => t.replace(/\D/g, '');
