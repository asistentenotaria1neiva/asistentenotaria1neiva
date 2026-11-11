/**
 * Verificaciones sin IA (no cuestan tokens) sobre la escritura generada, que se suman a la revisión
 * de la IA:
 *   - datos del negocio anterior que siguen en la escritura (números de documento, matrículas, valores
 *     y nombres de la plantilla que no aparecen en ningún documento ni en las observaciones);
 *   - valores en letras que no corresponden a su cifra;
 *   - lo que quedó «FALTA» o [VERIFICAR] y los cambios que no se pudieron aplicar.
 */
import { enteroALetras } from '../texto/numeros-a-letras';
import { normalizar, digitos } from '../texto/normalizar';
import type { Advertencia } from '../ia/instrucciones';
import type { NoAplicado } from './docx';

/** Números que identifican al negocio: cédulas y valores con puntos, matrículas, catastrales y números largos */
const NUMERO = /(?<![\d.-])(?:\d{1,3}(?:\.\d{3}){2,}|\d{2,4}-\d{4,}|\d{7,})(?![\d-])/g;
/** Nombre de persona antes de «, mayor de edad» o «identificado(a) con» */
const NOMBRE = /([A-ZÁÉÍÓÚÑ]{2,}(?:\s+(?:DE\s+(?:LA\s+|LOS\s+)?|DEL\s+)?[A-ZÁÉÍÓÚÑ]{2,}){1,5})\s*,?\s*(?:mayor(?:es)?\s+de\s+edad|identificad[oa]s?\s+con|quien(?:es)?\s+se\s+identific)/g;
/** Palabras en mayúsculas que no son nombres (rótulos y frases de la escritura) */
const NO_NOMBRES = /\b(?:NOTARI|ESCRITURA|REPUBLICA|COLOMBIA|DEPARTAMENTO|MUNICIPIO|COMPRAVENTA|HIPOTECA|VENDEDOR|COMPRADOR|PRIMERO|SEGUNDO|TERCERO|CLAUSULA|BANCO|SOCIEDAD|LTDA|S\.?A\.?S)/;

export interface EntradaVerificacion {
  /** Texto de cada párrafo de la plantilla (por número) */
  plantilla: Map<number, string>;
  /** Texto final de la escritura, un párrafo por renglón */
  escritura: string;
  /** Texto de lo leído en todos los documentos y de las observaciones (lo que sí es del negocio nuevo) */
  fuentes: string;
  /** Números propios de la notaría que no se deben señalar (código, resolución…) */
  ignorar?: string[];
}

/** Datos del negocio anterior que siguen en la escritura y no están en los documentos */
export function datosDeLaPlantillaAnterior(e: EntradaVerificacion): Advertencia[] {
  const fuentesDigitos = new Set([...e.fuentes.matchAll(/\d[\d.,-]*\d|\d/g)].map((m) => digitos(m[0])).filter((d) => d.length >= 5));
  const enFuentes = (n: string) => { const d = digitos(n); return [...fuentesDigitos].some((f) => f === d || (d.length >= 7 && f.includes(d))); };
  const fuentesNorm = normalizar(e.fuentes);
  const escrituraNorm = normalizar(e.escritura);
  const ignorar = new Set((e.ignorar ?? []).map(digitos));
  const vistos = new Set<string>();
  const salida: Advertencia[] = [];
  for (const [p, texto] of e.plantilla) {
    for (const m of texto.matchAll(NUMERO)) {
      const n = m[0];
      const d = digitos(n);
      if (vistos.has(d) || ignorar.has(d) || /^(?:19|20)\d{2}$/.test(d)) continue;
      vistos.add(d);
      // Sigue en la escritura (con o sin puntos) y no está en lo que se cargó para este negocio
      if (!e.escritura.includes(n) || enFuentes(n)) continue;
      salida.push({ nivel: 'ADVERTENCIA', origen: 'SISTEMA', p, detalle: `El número «${n}» viene de la plantilla (párrafo ${p}) y sigue en la escritura, pero no aparece en ningún documento cargado ni en las observaciones: verifique que no sea un dato del negocio anterior.` });
    }
    for (const m of texto.matchAll(NOMBRE)) {
      const nombre = m[1].trim();
      const clave = normalizar(nombre);
      if (vistos.has(clave) || NO_NOMBRES.test(clave) || clave.split(' ').length < 2) continue;
      vistos.add(clave);
      if (!escrituraNorm.includes(clave) || fuentesNorm.includes(clave)) continue;
      salida.push({ nivel: 'ADVERTENCIA', origen: 'SISTEMA', p, detalle: `«${nombre}» comparecía en la plantilla (párrafo ${p}) y sigue en la escritura, pero no aparece en los documentos cargados: verifique que no sea una persona del negocio anterior.` });
    }
  }
  return salida.slice(0, 25);
}

/** Valores en letras que no corresponden a la cifra que los acompaña: «… PESOS ($150.000.000)» */
export function valoresEnLetras(escritura: string): Advertencia[] {
  const salida: Advertencia[] = [];
  const texto = normalizar(escritura);
  for (const m of texto.matchAll(/\(\s*\$\s*([\d.]{5,})(?:,\d+)?\s*\)/g)) {
    const valor = Number(digitos(m[1]));
    if (!Number.isSafeInteger(valor) || valor < 1000) continue;
    const letras = normalizar(enteroALetras(valor));
    const alrededor = texto.slice(Math.max(0, m.index - 260), m.index) + ' ' + texto.slice(m.index + m[0].length, m.index + m[0].length + 260);
    // También la forma sin apócope («VEINTIUNO MILLONES» / «UN MILLON») que a veces usa la plantilla
    const variantes = [letras, letras.replace(/\bUN\b/g, 'UNO'), letras.replace(/\bVEINTIUN\b/g, 'VEINTIUNO')];
    if (variantes.some((v) => alrededor.includes(v))) continue;
    // Solo si hay un valor en letras cerca (no toda cifra entre paréntesis lo lleva)
    if (!/(?:PESOS|MILLONES|MIL)\b/.test(alrededor.slice(-120 - m[0].length))) continue;
    salida.push({ nivel: 'ADVERTENCIA', origen: 'SISTEMA', p: 0, detalle: `El valor en letras junto a «$${m[1]}» no corresponde a la cifra (debería decir «${letras} PESOS»).` });
  }
  return salida.slice(0, 15);
}

/** Advertencias de lo que quedó pendiente y de los cambios que no se aplicaron */
export function pendientes(faltantes: string[], verificar: string[], noAplicados: NoAplicado[]): Advertencia[] {
  const salida: Advertencia[] = [];
  if (faltantes.length) salida.push({ nivel: 'ADVERTENCIA', origen: 'SISTEMA', p: 0, detalle: `Quedaron ${faltantes.length} dato(s) «FALTA» (resaltados en amarillo en el Word): ${faltantes.slice(0, 12).join('; ')}${faltantes.length > 12 ? '…' : ''}. Cargue el documento que los trae o escríbalos en las observaciones y genere de nuevo.` });
  if (verificar.length) salida.push({ nivel: 'ADVERTENCIA', origen: 'SISTEMA', p: 0, detalle: `Hay ${verificar.length} punto(s) [VERIFICAR] resaltados en el Word: ${verificar.slice(0, 8).join('; ')}${verificar.length > 8 ? '…' : ''}.` });
  for (const n of noAplicados.slice(0, 15)) {
    salida.push({ nivel: 'ADVERTENCIA', origen: 'SISTEMA', p: n.p, detalle: `Párrafo ${n.p}: un cambio de la IA no se pudo aplicar (${n.motivo})${n.original ? ` — «${n.original}»` : ''}. Revise ese párrafo en el Word.` });
  }
  return salida;
}
