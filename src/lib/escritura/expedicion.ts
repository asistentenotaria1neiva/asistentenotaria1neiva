/**
 * La expedición del documento de identidad («1.075.234.567 expedida en Neiva») no va en mayúscula
 * sostenida ni en negrita: «expedida en» en minúscula y el lugar con mayúscula inicial y sus tildes.
 * La negrita la pone el formato a lo que va en mayúsculas, así que basta con escribirlo así.
 */

/** Lugares que en mayúscula suelen venir sin tilde */
const CON_TILDE: Record<string, string> = {
  BOGOTA: 'Bogotá', MEDELLIN: 'Medellín', IBAGUE: 'Ibagué', POPAYAN: 'Popayán', CUCUTA: 'Cúcuta', MONTERIA: 'Montería',
  QUIBDO: 'Quibdó', GARZON: 'Garzón', NATAGA: 'Nátaga', TIMANA: 'Timaná', IQUIRA: 'Íquira', YAGUARA: 'Yaguará',
  AGUSTIN: 'Agustín', JOSE: 'José', MARIA: 'María', ELIAS: 'Elías', FUSAGASUGA: 'Fusagasugá', CHIA: 'Chía',
  ZIPAQUIRA: 'Zipaquirá', SOGAMOSO: 'Sogamoso', ESPINAL: 'Espinal', GIRARDOT: 'Girardot', PURIFICACION: 'Purificación',
  CAQUETA: 'Caquetá', BOLIVAR: 'Bolívar', CORDOBA: 'Córdoba', BOYACA: 'Boyacá', CHOCO: 'Chocó', GUAPI: 'Guapi',
  SAN: 'San', TOLIMA: 'Tolima', HUILA: 'Huila',
};
const MINUSCULAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y']);

/** «BOGOTA D.C.» → «Bogotá D.C.», «LA PLATA» → «La Plata», «(H)» y las siglas con punto se dejan */
function lugarComoNombre(lugar: string): string {
  return lugar.split(/([  ]+)/).map((w, i) => {
    if (!w.trim() || /\./.test(w) || /^\(.*\)$/.test(w)) return w;
    if (i > 0 && MINUSCULAS.has(w)) return w.toLowerCase();
    return CON_TILDE[w] ?? w.charAt(0) + w.slice(1).toLowerCase();
  }).join('');
}

/** Palabras que ya no son del lugar («NEIVA ESTADO CIVIL…», «NEIVA Y …») */
const NO_ES_LUGAR = '(?:ESTADO|Y|QUIEN|QUIENES|MAYOR|DOMICILIAD[OA]S?|ACTIVIDAD|CON|EN|IDENTIFICAD[OA]S?|VECIN[OA]S?)\\b';
const PALABRA = `(?!${NO_ES_LUGAR})(?:[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ.]*|\\([A-Z.]+\\))`;
const EXPEDIDA = new RegExp(`\\b(EXPEDID[AO]S?|[Ee]xpedid[ao]s?)([ \\u00a0]+)(?:EN|en)\\b(?:([ \\u00a0]+)(${PALABRA}(?:[ \\u00a0]+${PALABRA}){0,4})(?![a-záéíóúñ]))?`, 'g');

/** «expedida en Neiva», «expedido en Bogotá D.C.», «expedida en La Plata (H)» ya escritos como van */
const CAP = '(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\\.?|[A-Z]\\.(?:[A-Z]\\.)+|\\([A-Z.]+\\))';
const EXPEDIDA_MINUSCULA = new RegExp(`\\bexpedid[ao]s?[ \\u00a0]+en\\b(?:[ \\u00a0]+${CAP}(?:[ \\u00a0]+(?:(?:de|del|la|las|los|el)[ \\u00a0]+)?${CAP}){0,3})?`, 'g');

/**
 * Para el formato final del párrafo: el texto con la expedición en minúscula (mismo largo, para no
 * descuadrar las corridas) y los tramos [inicio, fin) de cada expedición, que van sin negrilla.
 */
export function expedicionesSinNegrilla(texto: string): { texto: string; tramos: [number, number][] } {
  if (!texto || !/expedid/i.test(texto)) return { texto, tramos: [] };
  const nuevo = expedicionEnMinuscula(texto);
  const base = nuevo.length === texto.length ? nuevo : texto;
  const tramos = [...base.matchAll(EXPEDIDA_MINUSCULA)].map((m): [number, number] => [m.index!, m.index! + m[0].length]);
  return { texto: base, tramos };
}

export function expedicionEnMinuscula(texto: string): string {
  if (!texto || !/expedid/i.test(texto)) return texto;
  return texto.replace(EXPEDIDA, (todo, expedida: string, esp: string, esp2?: string, lugar?: string) => {
    // Solo si viene en mayúscula sostenida (lo que la plantilla ya trae bien no se toca)
    const enMayuscula = expedida === expedida.toUpperCase() || (lugar && lugar === lugar.toUpperCase() && /[A-ZÑ]{3}/.test(lugar));
    if (!enMayuscula) return todo;
    const lugarNuevo = lugar && lugar === lugar.toUpperCase() ? lugarComoNombre(lugar) : lugar;
    return `${expedida.toLowerCase()}${esp}en${lugar ? `${esp2}${lugarNuevo}` : ''}`;
  });
}
