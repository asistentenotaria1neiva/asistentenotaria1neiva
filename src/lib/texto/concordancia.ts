/**
 * Concordancia de género y número para las plantillas.
 *
 * Las escrituras de la notaría concuerdan cada palabra con las personas
 * ("la vendedora", "los compradores", "domiciliada", "transfieren"). Uno de los
 * errores encontrados en la Fase 0 fue "domiciliada" para un apoderado hombre:
 * estas funciones evitan que el personal tenga que ajustar a mano cada palabra.
 *
 * Se registran como filtros de las plantillas:
 *   {{a.vendedores | el:'vendedor'}}      → el vendedor | la vendedora | los vendedores | las vendedoras
 *   {{a.vendedores | El:'vendedor'}}      → igual, con mayúscula inicial
 *   {{a.vendedores | sust:'vendedor'}}    → vendedor | vendedora | vendedores | vendedoras
 *   {{p | g:'domiciliado'}}               → domiciliado | domiciliada | domiciliados | domiciliadas
 *   {{a.vendedores | v:'transfiere':'transfieren'}} → singular o plural según cuántas personas son
 *   {{a.compradores | quien}}             → quien dijo ser | quienes dijeron ser
 *   {{a.conyuges | nombres}}              → "ANA PÉREZ y JUAN GÓMEZ" (usa "e" ante I/HI)
 */

export interface ConGenero {
  genero?: 'M' | 'F';
  tipo_persona?: 'NATURAL' | 'JURIDICA';
  nombre?: string;
  /** Género gramatical de una persona jurídica: "la sociedad" (F), "el banco" (M) */
  genero_gramatical?: 'M' | 'F';
}

type Grupo = ConGenero | ConGenero[] | null | undefined;

const lista = (g: Grupo): ConGenero[] => (Array.isArray(g) ? g : g ? [g] : []);

/** F si todas son femeninas; M si hay al menos una masculina (regla del español) */
export function generoGrupo(g: Grupo): 'M' | 'F' {
  const l = lista(g);
  if (!l.length) return 'M';
  return l.every((p) => (p.tipo_persona === 'JURIDICA' ? (p.genero_gramatical ?? 'F') : p.genero) === 'F') ? 'F' : 'M';
}

export const esPlural = (g: Grupo) => lista(g).length > 1;

const IRREGULARES: Record<string, [string, string, string, string]> = {
  // singular m, singular f, plural m, plural f
  señor: ['señor', 'señora', 'señores', 'señoras'],
  cónyuge: ['cónyuge', 'cónyuge', 'cónyuges', 'cónyuges'],
  otorgante: ['otorgante', 'otorgante', 'otorgantes', 'otorgantes'],
  compareciente: ['compareciente', 'compareciente', 'comparecientes', 'comparecientes'],
  poderdante: ['poderdante', 'poderdante', 'poderdantes', 'poderdantes'],
  menor: ['menor', 'menor', 'menores', 'menores'],
  'actual propietario': ['actual propietario', 'actual propietaria', 'actuales propietarios', 'actuales propietarias'],
  'compañero permanente': ['compañero permanente', 'compañera permanente', 'compañeros permanentes', 'compañeras permanentes'],
};

/** Flexiona un sustantivo o adjetivo regular en español */
export function flexionar(palabra: string, genero: 'M' | 'F', plural: boolean): string {
  const irregular = IRREGULARES[palabra.toLowerCase()];
  if (irregular) return irregular[(plural ? 2 : 0) + (genero === 'F' ? 1 : 0)];
  let base = palabra;
  if (/or$/i.test(base)) { // vendedor, comprador, deudor
    if (genero === 'F') base += 'a';
    return plural ? (genero === 'F' ? base + 's' : base + 'es') : base;
  }
  if (/o$/i.test(base)) { // domiciliado, apoderado, heredero, hijo, propietario
    if (genero === 'F') base = base.slice(0, -1) + 'a';
    return plural ? base + 's' : base;
  }
  // terminaciones invariables en género (e, consonante)
  return plural ? (/[aeiou]$/i.test(base) ? base + 's' : base + 'es') : base;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "el vendedor", "la vendedora", "los vendedores", "las vendedoras" */
export function articuloSustantivo(g: Grupo, palabra: string): string {
  const genero = generoGrupo(g);
  const plural = esPlural(g);
  const art = plural ? (genero === 'F' ? 'las' : 'los') : (genero === 'F' ? 'la' : 'el');
  return `${art} ${flexionar(palabra, genero, plural)}`;
}

/** Une nombres: "A", "A y B", "A, B y C"; usa "e" ante palabras que empiezan por I- o HI- (no HIE-) */
export function unirNombres(nombres: string[]): string {
  const n = nombres.filter(Boolean);
  if (n.length <= 1) return n[0] ?? '';
  const ultimo = n[n.length - 1];
  const conjuncion = /^(I|HI)(?!E)/i.test(ultimo.normalize('NFD').replace(/[̀-ͯ]/g, '')) ? 'e' : 'y';
  return `${n.slice(0, -1).join(', ')} ${conjuncion} ${ultimo}`;
}

/** Resuelve "SOLTERO(A)" o "CASADO(A)" según el género */
export function estadoCivilConGenero(estado: string | undefined, genero: 'M' | 'F' | undefined): string {
  if (!estado) return '';
  return estado.replace(/([A-ZÁÉÍÓÚ]+)O\(A\)/g, (_, raiz) => raiz + (genero === 'F' ? 'A' : 'O'));
}

/** Filtros registrados en el motor de plantillas (angular-expressions) */
export const filtrosConcordancia = {
  el: (g: Grupo, palabra: string) => articuloSustantivo(g, palabra),
  El: (g: Grupo, palabra: string) => capital(articuloSustantivo(g, palabra)),
  EL: (g: Grupo, palabra: string) => articuloSustantivo(g, palabra).toUpperCase(),
  sust: (g: Grupo, palabra: string) => flexionar(palabra, generoGrupo(g), esPlural(g)),
  g: (g: Grupo, palabra: string) => flexionar(palabra, generoGrupo(g), esPlural(g)),
  v: (g: Grupo, singular: string, plural: string) => (esPlural(g) ? plural : singular),
  quien: (g: Grupo) => (esPlural(g) ? 'quienes dijeron ser' : 'quien dijo ser'),
  nombres: (g: Grupo) => unirNombres(lista(g).map((p) => p.nombre ?? '')),
  mayus: (s: unknown) => String(s ?? '').toUpperCase(),
};
