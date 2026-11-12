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

/** Un dato de la plantilla que no está en los documentos ni en las observaciones del negocio nuevo */
interface DatoAnterior { tipo: 'numero' | 'nombre'; valor: string; p: number; esta: (texto: string) => boolean }

/**
 * Números (cédulas, NIT, matrículas, valores) y nombres de personas de la plantilla que no aparecen en
 * lo cargado para este negocio: si siguen en la escritura, probablemente son del negocio anterior.
 */
function datosAnteriores(plantilla: Map<number, string>, fuentes: string, ignorarLista: string[] = []): DatoAnterior[] {
  const fuentesDigitos = new Set([...fuentes.matchAll(/\d[\d.,-]*\d|\d/g)].map((m) => digitos(m[0])).filter((d) => d.length >= 5));
  const enFuentes = (n: string) => { const d = digitos(n); return [...fuentesDigitos].some((f) => f === d || (d.length >= 7 && f.includes(d))); };
  const fuentesNorm = normalizar(fuentes);
  const ignorar = new Set(ignorarLista.map(digitos));
  const vistos = new Set<string>();
  const salida: DatoAnterior[] = [];
  for (const [p, texto] of plantilla) {
    for (const m of texto.matchAll(NUMERO)) {
      const n = m[0];
      const d = digitos(n);
      if (vistos.has(d) || ignorar.has(d) || /^(?:19|20)\d{2}$/.test(d)) continue;
      vistos.add(d);
      if (!enFuentes(n)) salida.push({ tipo: 'numero', valor: n, p, esta: (t) => t.includes(n) });
    }
    for (const m of texto.matchAll(NOMBRE)) {
      const nombre = m[1].trim();
      const clave = normalizar(nombre);
      if (vistos.has(clave) || NO_NOMBRES.test(clave) || clave.split(' ').length < 2) continue;
      vistos.add(clave);
      if (!fuentesNorm.includes(clave)) salida.push({ tipo: 'nombre', valor: nombre, p, esta: (t) => normalizar(t).includes(clave) });
    }
  }
  return salida;
}

/** Datos del negocio anterior que siguen en la escritura y no están en los documentos */
export function datosDeLaPlantillaAnterior(e: EntradaVerificacion): Advertencia[] {
  return datosAnteriores(e.plantilla, e.fuentes, e.ignorar).filter((d) => d.esta(e.escritura)).slice(0, 25).map((d) => ({
    nivel: 'ADVERTENCIA', origen: 'SISTEMA', p: d.p,
    detalle: d.tipo === 'numero'
      ? `El número «${d.valor}» viene de la plantilla (párrafo ${d.p}) y sigue en la escritura, pero no aparece en ningún documento cargado ni en las observaciones: verifique que no sea un dato del negocio anterior (si es de la parte que se conserva, como el banco o su apoderado, está bien).`
      : `«${d.valor}» comparecía en la plantilla (párrafo ${d.p}) y sigue en la escritura, pero no aparece en los documentos cargados: verifique que no sea una persona del negocio anterior (si es de la parte que se conserva, como el apoderado del banco, está bien).`,
  }));
}

/**
 * Por párrafo de la plantilla, los datos del negocio anterior que siguen en su texto actual
 * (`actuales`: el texto ya adaptado de cada párrafo). Es lo que la corrección le devuelve a la IA.
 */
export function restosDelNegocioAnterior(plantilla: Map<number, string>, actuales: Map<number, string>, fuentes: string, ignorar?: string[]): Map<number, string[]> {
  const datos = datosAnteriores(plantilla, fuentes, ignorar);
  const salida = new Map<number, string[]>();
  for (const [n, texto] of actuales) {
    const aqui = datos.filter((d) => d.esta(texto)).map((d) => d.tipo === 'numero'
      ? `El número «${d.valor}» es de la plantilla y no aparece en los documentos ni en las observaciones.`
      : `«${d.valor}» es una persona de la plantilla que no aparece en los documentos ni en las observaciones.`);
    if (aqui.length) salida.set(n, aqui);
  }
  return salida;
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

/** Unidad de una medida (ya normalizada a mayúsculas): metros, metros lineales, metros cuadrados */
const UNIDAD = String.raw`(?:MTS2|MT2|M2|M²|MTS|MT|MLS|ML|METROS(?: LINEALES| CUADRADOS)?|M)\.?(?![A-ZÑ0-9])`;
/** «(6.00 m)», «(72,50 M2)»: la cifra de una medida entre paréntesis, que va después de sus letras */
const MEDIDA_PARENTESIS = new RegExp(String.raw`\(\s*(\d{1,6})(?:[.,](\d{1,4}))?\s*${UNIDAD}\s*\)`, 'g');
/** «6.00 MTS», «22 METROS»: una medida en cifras sin paréntesis (como la copia el certificado de tradición) */
const MEDIDA_SUELTA = new RegExp(String.raw`(?<![\d.,A-ZÑ-])(\d{1,6}(?:[.,]\d{1,4})?)\s*${UNIDAD}`, 'g');
/** Un párrafo de linderos: el rótulo de un costado («NORTE:», «SUROCCIDENTE:») o la frase que los presenta */
const LINDERO = /(?:^|[^A-ZÑ])(?:NOR|SUR)?(?:NORTE|SUR|ORIENTE|OCCIDENTE|CENIT|NADIR)\s*:|LINDEROS\s*:/;

const conLetras = (texto: string, letras: string) => new RegExp(`(?:^|[^A-ZÑ])${letras}(?:[^A-ZÑ]|$)`).test(texto);
const letrasDe = (n: number) => [...new Set([enteroALetras(n), enteroALetras(n, { apocope: false })])];

/** Las medidas del párrafo: las que no van en letras y en cifras (cada una como frase) y cuántas sí */
function analizarMedidas(parrafo: string): { problemas: string[]; bien: number } {
  const texto = normalizar(parrafo);
  const problemas: string[] = [];
  let bien = 0;
  let finAnterior = 0;
  for (const m of texto.matchAll(MEDIDA_PARENTESIS)) {
    const antes = texto.slice(Math.max(finAnterior, m.index - 160), m.index);
    finAnterior = m.index + m[0].length;
    const entero = Number(m[1]);
    const dec = m[2] && Number(m[2]) ? m[2] : '';
    const centesimas = dec ? Math.round(Number(`0.${dec}`) * 100) : 0;
    const okEntero = letrasDe(entero).some((l) => conLetras(antes, l));
    // «6.50»: «PUNTO CINCUENTA» (o «CINCO», según cómo lo escriba la plantilla)
    const okDecimal = !dec || [...letrasDe(centesimas), ...letrasDe(Number(dec))].some((l) => conLetras(antes, l));
    if (okEntero && okDecimal) { bien++; continue; }
    const cifra = `${m[1]}${m[2] ? `.${m[2]}` : ''}`;
    problemas.push(/(?:METRO|PUNTO)[A-ZÑ ]*$/.test(antes.slice(-80))
      ? `Las letras de la medida «${m[0]}» no corresponden a la cifra: deben decir «${enteroALetras(entero)}${dec ? ` PUNTO ${enteroALetras(centesimas, { apocope: false })}` : ''}».`
      : `La medida «${cifra}» va solo en cifras: escríbala en letras y en cifras, como en la plantilla.`);
  }
  for (const m of texto.matchAll(MEDIDA_SUELTA)) {
    // La que está entre paréntesis ya se revisó arriba
    if (/\(\s*$/.test(texto.slice(Math.max(0, m.index - 3), m.index))) continue;
    problemas.push(`La medida «${m[0].trim()}» va solo en cifras: escríbala en letras y en cifras, como en la plantilla (p. ej. «seis metros (6.00 m)»).`);
  }
  return { problemas: [...new Set(problemas)], bien };
}

/**
 * Medidas (linderos, áreas) que no van en letras y en cifras —«seis metros (6.00 m)»—: la cifra sin
 * sus letras, o las letras que no corresponden a la cifra. Cada problema es una frase con la medida.
 */
export const medidasSinLetras = (parrafo: string) => analizarMedidas(parrafo).problemas;

/**
 * Los problemas de medidas de un párrafo ya adaptado que no venían en la plantilla. Se revisan los
 * párrafos de linderos y los demás solo si la plantilla escribía allí sus medidas en letras y en cifras
 * (un «Nivel 2.40 m» que la plantilla trae en cifras se deja como está).
 */
export function medidasPorRevisar(dePlantilla: string, actual: string): string[] {
  const antes = analizarMedidas(dePlantilla);
  if (!LINDERO.test(normalizar(actual)) && !antes.bien) return [];
  const yaEstaban = new Set(antes.problemas);
  return medidasSinLetras(actual).filter((x) => !yaEstaban.has(x));
}

/** Advertencias de las medidas que no quedaron en letras y en cifras en los párrafos que cambiaron */
export function medidasEnLetras(plantilla: Map<number, string>, cambiados: Map<number, string>): Advertencia[] {
  const salida: Advertencia[] = [];
  for (const [p, texto] of cambiados) for (const detalle of medidasPorRevisar(plantilla.get(p) ?? '', texto)) salida.push({ nivel: 'ADVERTENCIA', origen: 'SISTEMA', p, detalle: `Párrafo ${p}: ${detalle}` });
  return salida.slice(0, 10);
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
