/**
 * Rescate de una respuesta JSON cortada por longitud: los elementos completos del arreglo `clave`
 * (se recorre respetando las cadenas y se descarta el último elemento si quedó a medias).
 */
export function rescatarArreglo<T>(texto: string, clave: string): T[] {
  const m = new RegExp(`"${clave}"\\s*:\\s*\\[`).exec(texto);
  if (!m) return [];
  const lista: T[] = [];
  let inicio = -1, nivel = 0, enCadena = false;
  for (let i = m.index + m[0].length; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) {
      if (c === '\\') i++;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') enCadena = true;
    else if (c === '{' || c === '[') { if (nivel === 0) inicio = i; nivel++; }
    else if (c === '}' || c === ']') {
      if (nivel === 0) break; // fin del arreglo
      nivel--;
      if (nivel === 0 && inicio >= 0) {
        try { lista.push(JSON.parse(texto.slice(inicio, i + 1)) as T); } catch { break; }
        inicio = -1;
      }
    }
  }
  return lista;
}

/** Valor de una propiedad de texto de primer nivel en un JSON cortado ('' si no alcanzó a salir completo) */
export function rescatarTexto(texto: string, clave: string): string {
  const m = new RegExp(`"${clave}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`).exec(texto);
  if (!m) return '';
  try { return JSON.parse(m[1]) as string; } catch { return ''; }
}
