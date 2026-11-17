/**
 * Concordancia de género con cada persona (sin IA): la plantilla es de otro negocio y, si allí
 * comparecía una mujer y ahora un hombre (o al revés), es fácil que queden «domiciliada»,
 * «identificada», «la señora»… con la persona nueva. Con el género de cada otorgante (lo dice la IA,
 * de su cédula o su nombre) se revisan las palabras que lo acompañan.
 */
import type { Otorgante } from '../ia/instrucciones';

export type Genero = 'HOMBRE' | 'MUJER';

/** Mayúsculas y sin tildes, con el MISMO largo (para ubicar las posiciones en el texto original) */
const plegar = (t: string) => [...t].map((c) => { const b = c.normalize('NFD')[0]; const u = b.toUpperCase(); return u.length === 1 ? u : b; }).join('');

/** Palabras que concuerdan con la persona (en singular: el plural es de varias personas) */
const CONCUERDA = /\b(DOMICILIAD|IDENTIFICAD|VECIN|RESIDENCIAD|NACID|EMPLEAD|PENSIONAD|JUBILAD|SOLTER|CASAD|VIUD|DIVORCIAD)(O|A)\b/g;
/** Lo que va justo antes del nombre: «el señor», «la señora», «la compareciente» */
const ANTES = /\b(?:(EL|LA)\s+)?(SENOR|SENORA|SENORITA|DONA|DON)\s*$|\b(EL|LA)\s+(?:COMPARECIENTE|OTORGANTE|VENDEDORA?|COMPRADORA?|DEUDORA?|PODERDANTE|DONANTE|DONATARIA?|HIPOTECANTE)\s*,?\s*$/;
/** Donde termina lo que se dice de una persona */
const CORTE = /MANIFEST|[;:]|\bQUIEN(?:ES)?\s+(?:OBRA|ACTUA|ACT[UÚ]A)/;
/** Otro nombre de persona (empieza la siguiente): dos o más palabras en mayúscula seguidas de «, mayor de edad» o similar */
const OTRO_NOMBRE = /[A-ZÑ]{2,}(?:\s+(?:DE\s+(?:LA\s+|LOS\s+)?|DEL\s+)?[A-ZÑ]{2,}){1,5}\s*,?\s*(?:MAYOR(?:ES)?\s+DE\s+EDAD|IDENTIFICAD[OA]S?\s+CON|QUIEN(?:ES)?\s+SE\s+IDENTIFIC)/;
const LARGO_VENTANA = 400;

/** Una palabra que no concuerda con el género de la persona */
export interface Discordancia { nombre: string; genero: Genero; palabra: string }

const correcta = (g: Genero, vocal: string) => (g === 'HOMBRE' ? vocal === 'O' : vocal === 'A');

/**
 * Palabras del párrafo que no concuerdan con el género de la persona a la que se refieren: las que van
 * después de su nombre (hasta «manifestó», el nombre de otra persona o unos 400 caracteres) y el
 * tratamiento que va justo antes («el señor», «la señora»).
 */
export function discordanciasDeGenero(parrafo: string, otorgantes: Otorgante[]): Discordancia[] {
  if (!parrafo) return [];
  const texto = plegar(parrafo);
  const personas = otorgantes
    .filter((o) => (o.genero === 'HOMBRE' || o.genero === 'MUJER') && o.nombre?.trim())
    .map((o) => ({ nombre: o.nombre.trim(), genero: o.genero as Genero, buscar: plegar(o.nombre.trim()).replace(/\s+/g, ' ') }))
    .filter((p) => p.buscar.split(' ').length >= 2);
  if (!personas.length) return [];
  const salida: Discordancia[] = [];
  const visto = new Set<string>();
  const agregar = (d: Discordancia) => { const k = `${d.nombre}|${d.palabra}`; if (!visto.has(k)) { visto.add(k); salida.push(d); } };
  // Todas las apariciones de los nombres, en orden (la ventana de una persona termina donde empieza otra)
  const apariciones = personas.flatMap((p) => {
    const re = new RegExp(`(?<![A-ZÑ])${p.buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}(?![A-ZÑ])`, 'g');
    return [...texto.matchAll(re)].map((m) => ({ p, inicio: m.index!, fin: m.index! + m[0].length }));
  }).sort((a, b) => a.inicio - b.inicio);
  for (const [i, a] of apariciones.entries()) {
    // Antes del nombre
    const desde = Math.max(0, a.inicio - 40);
    const antes = ANTES.exec(texto.slice(desde, a.inicio));
    if (antes) {
      const articulo = antes[1] ?? antes[3];
      const femenino = articulo ? articulo === 'LA' : /^(SENORA|SENORITA|DONA)$/.test(antes[2] ?? '');
      if (femenino !== (a.p.genero === 'MUJER')) agregar({ nombre: a.p.nombre, genero: a.p.genero, palabra: parrafo.slice(desde + antes.index!, a.inicio).replace(/[\s,]+$/, '') });
    }
    // Después del nombre
    let fin = Math.min(texto.length, a.fin + LARGO_VENTANA, apariciones[i + 1]?.inicio ?? Infinity);
    const resto = texto.slice(a.fin, fin);
    const corte = CORTE.exec(resto);
    const otro = OTRO_NOMBRE.exec(resto);
    fin = a.fin + Math.min(corte?.index ?? Infinity, otro && otro.index > 0 ? otro.index : Infinity, resto.length);
    const ventana = texto.slice(a.fin, fin);
    for (const m of ventana.matchAll(CONCUERDA)) {
      if (correcta(a.p.genero, m[2])) continue;
      const original = parrafo.slice(a.fin + m.index!, a.fin + m.index! + m[0].length);
      agregar({ nombre: a.p.nombre, genero: a.p.genero, palabra: original });
    }
  }
  return salida;
}

/** Motivo para la corrección de la IA y para la revisión */
export function describirDiscordancias(ds: Discordancia[]): string[] {
  const porPersona = new Map<string, Discordancia[]>();
  for (const d of ds) porPersona.set(d.nombre, [...(porPersona.get(d.nombre) ?? []), d]);
  return [...porPersona].map(([nombre, lista]) => {
    const g = lista[0].genero;
    return `${nombre} es ${g === 'HOMBRE' ? 'un hombre' : 'una mujer'}, pero el párrafo se refiere a ${g === 'HOMBRE' ? 'él en femenino' : 'ella en masculino'}: ${lista.map((d) => `«${d.palabra}»`).join(', ')}. Corrige la concordancia de género con esa persona en todo el párrafo.`;
  });
}
