/**
 * Unidades privadas del negocio (apartamento, parqueadero, depósito, casa, local…) y sus párrafos
 * textuales en un Word cargado (típicamente el reglamento de propiedad horizontal).
 *
 * Un reglamento trae decenas de unidades: su lectura con IA lo resume («áreas de ejemplo») y, si pasa de
 * 150.000 caracteres, solo se envía el comienzo. Así los linderos de la unidad vendida nunca llegaban a la
 * redacción (EXP-2026-00198: el apartamento 405 estaba en el carácter 282.083 de 765.988). Como el Word es
 * texto exacto, el sistema busca aquí los párrafos de cada unidad y los entrega tal cual.
 */
import { normalizar } from '../texto/normalizar';
import type { DocumentoLeido } from '../ia/instrucciones';

/** Tipo de unidad → cómo se escribe en los documentos (normalizado: mayúsculas, sin tildes) */
const TIPOS: Record<string, string> = {
  APARTAMENTO: 'APARTAMENTO|APARTAESTUDIO|APTO|APT',
  PARQUEADERO: 'PARQUEADERO|GARAJE|ESTACIONAMIENTO|PARQ',
  DEPOSITO: 'DEPOSITO|CUARTO UTIL',
  CASA: 'CASA',
  LOCAL: 'LOCAL COMERCIAL|LOCAL',
  OFICINA: 'OFICINA',
  CONSULTORIO: 'CONSULTORIO',
  BODEGA: 'BODEGA',
  LOTE: 'LOTE',
};

const NUMERO = String.raw`(?:N[O°º]?\.?\s*|NUMERO\s*|#\s*)?(\d{1,5}[A-Z]?(?:-\d{1,4})?)(?!\d|[.,]\d)`;
const TORRE = /\b(TORRE|BLOQUE|INTERIOR|MANZANA|ETAPA)\s*(?:N[O°º]?\.?\s*)?(\d{1,3}|[A-Z])\b/;
/** Tipo con su número en cualquier parte del texto («MEDITERRANEO APT 405, GARAJE N° 482») */
const MENCION = new RegExp(String.raw`\b(${Object.values(TIPOS).join('|')})\.?\s*${NUMERO}`, 'g');
/** Párrafo que empieza describiendo una unidad («APARTAMENTO 405: Ver plano…», «1. PARQUEADERO 482.») */
const ENCABEZADO = new RegExp(String.raw`^[\s\d.)\-–•*]{0,8}(?:UNIDAD PRIVADA\s*)?(${Object.values(TIPOS).join('|')})\.?\s*${NUMERO}\s*[:.,\-–)]?`);
/** Encabezado de otra sección del reglamento: ahí termina la descripción de la unidad */
const SECCION = /^(ARTICULO|CAPITULO|TITULO|PARAGRAFO)\b/;

const MAX_PARRAFOS = 12;
const MAX_CARACTERES = 12_000;
const MAX_COINCIDENCIAS = 4;

/** Sin las series de relleno de fin de renglón («+ + + +», «= = =», «* * *»): solo gastan tokens */
export const sinRelleno = (t: string) => t.replace(/[ \t]*(?:[+*=~][ \t]*){4,}/g, ' ').replace(/ +(\n|$)/g, '$1').replace(/ {2,}/g, ' ');

export interface Unidad { tipo: string; numero: string; agrupacion?: string }

const tipoDe = (palabra: string) => Object.entries(TIPOS).find(([, v]) => new RegExp(`^(?:${v})$`).test(palabra))?.[0] ?? palabra;
const clave = (u: Unidad) => `${u.tipo} ${u.numero}`;

/** Las unidades que nombra un texto (sin repetir), con su torre o bloque si va al lado */
export function unidadesEn(texto: string): Unidad[] {
  const t = normalizar(texto);
  const lista = new Map<string, Unidad>();
  for (const m of t.matchAll(MENCION)) {
    const u: Unidad = { tipo: tipoDe(m[1]), numero: m[2] };
    // «LOTE 2B» o «ETAPA 1» del proyecto no son la unidad vendida si no hay más; el lote solo cuenta solo
    const despues = t.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
    const antes = t.slice(Math.max(0, m.index! - 30), m.index!);
    const agr = despues.match(TORRE) ?? antes.match(TORRE);
    if (agr && agr[1] !== 'ETAPA') u.agrupacion = `${agr[1]} ${agr[2]}`;
    const k = clave(u);
    if (!lista.has(k) || (!lista.get(k)!.agrupacion && u.agrupacion)) lista.set(k, u);
  }
  return [...lista.values()];
}

/**
 * Unidades del negocio: las que nombran los datos leídos de los documentos (orden, certificado, promesa)
 * y las observaciones. No se toman de los linderos (nombran a los vecinos: «con el apartamento 404»).
 */
export function unidadesDelNegocio(lecturas: DocumentoLeido[], observaciones: string | null | undefined): Unidad[] {
  const textos = lecturas.flatMap((d) => (d.datos ?? [])
    .filter((x) => x.valor && !/linder|colind|vecin/i.test(`${x.dato} ${x.valor}`))
    .map((x) => `${x.dato}: ${x.valor}`));
  if (observaciones) textos.push(observaciones);
  const todas = new Map<string, Unidad>();
  for (const u of textos.flatMap(unidadesEn)) {
    const k = clave(u);
    if (!todas.has(k) || (!todas.get(k)!.agrupacion && u.agrupacion)) todas.set(k, u);
  }
  // Un LOTE solo cuenta si no hay otra unidad (en propiedad horizontal es el lote matriz del proyecto)
  const lista = [...todas.values()];
  return lista.some((u) => u.tipo !== 'LOTE') ? lista.filter((u) => u.tipo !== 'LOTE') : lista;
}

/** Párrafos (texto exacto) que describen cada unidad en el documento, empezando por su encabezado */
export function fragmentosDeUnidades(parrafos: string[], unidades: Unidad[]): { unidad: Unidad; texto: string }[] {
  if (!unidades.length) return [];
  const normalizados = parrafos.map(normalizar);
  const resultado: { unidad: Unidad; texto: string }[] = [];
  for (const u of unidades) {
    const inicios: number[] = [];
    normalizados.forEach((p, i) => {
      const m = p.match(ENCABEZADO);
      if (m && tipoDe(m[1]) === u.tipo && m[2] === u.numero) inicios.push(i);
    });
    if (!inicios.length) continue;
    const bloques = inicios.map((i) => {
      const partes = [parrafos[i]];
      let largo = parrafos[i].length;
      for (let j = i + 1; j < parrafos.length && partes.length < MAX_PARRAFOS; j++) {
        if (ENCABEZADO.test(normalizados[j]) || SECCION.test(normalizados[j])) break;
        if (largo + parrafos[j].length > MAX_CARACTERES) break;
        partes.push(parrafos[j]);
        largo += parrafos[j].length;
      }
      return { inicio: i, texto: sinRelleno(partes.join('\n')) };
    });
    // La misma numeración en varias torres: se prefieren las de la torre del negocio
    const deSuTorre = u.agrupacion ? bloques.filter((b) => normalizar(b.texto).includes(u.agrupacion!)) : [];
    for (const b of (deSuTorre.length ? deSuTorre : bloques).slice(0, MAX_COINCIDENCIAS)) resultado.push({ unidad: u, texto: b.texto });
  }
  return resultado;
}

/** Desde cuántas unidades descritas un Word es un listado (reglamento) y no la escritura de un inmueble */
const MINIMO_UNIDADES_LISTADO = 8;

/**
 * Para la lectura con IA de un Word: si describe muchas unidades (reglamento de propiedad horizontal),
 * quita sus párrafos y deja un índice. La IA no los transcribiría completos (los resume) y son casi todo
 * el texto; el sistema copia textual la del negocio al generar (fragmentosDeUnidades). Lo demás —partes,
 * licencias, linderos generales del lote, coeficientes— llega completo a la lectura y con menos tokens.
 * null si el Word no es un listado de unidades (se lee entero, como siempre).
 */
export function compactarUnidades(parrafos: string[]): { parrafos: string[]; quitadas: number; caracteresQuitados: number } | null {
  const normalizados = parrafos.map(normalizar);
  const encabezados = normalizados.map((p) => p.match(ENCABEZADO));
  // El LOTE es el lote matriz (linderos generales del proyecto): nunca se quita
  const esLote = encabezados.map((m) => !!m && tipoDe(m[1]) === 'LOTE');
  if (encabezados.filter((m, i) => m && !esLote[i]).length < MINIMO_UNIDADES_LISTADO) return null;
  const salida: string[] = [];
  const indice = new Map<string, string[]>();
  let quitadas = 0, caracteresQuitados = 0, enUnidad = false, pendienteIndice = false, parrafosUnidad = 0, largoUnidad = 0;
  const volcarIndice = () => {
    if (!pendienteIndice) return;
    salida.push(`[El sistema omitió aquí la descripción textual de: ${[...indice].map(([t, ns]) => `${t} ${ns.join(', ')}`).join('; ')}. La de las unidades del negocio se entrega aparte, completa.]`);
    indice.clear();
    pendienteIndice = false;
  };
  for (let i = 0; i < parrafos.length; i++) {
    const m = esLote[i] ? null : encabezados[i];
    if (esLote[i]) {
      enUnidad = false;
    } else if (m) {
      enUnidad = true;
      parrafosUnidad = 1;
      largoUnidad = parrafos[i].length;
      const tipo = tipoDe(m[1]);
      indice.set(tipo, [...(indice.get(tipo) ?? []), m[2]]);
    } else if (enUnidad) {
      // Mismo corte que fragmentosDeUnidades: lo que se quita es exactamente lo que se entrega aparte
      parrafosUnidad++;
      largoUnidad += parrafos[i].length;
      if (SECCION.test(normalizados[i]) || parrafosUnidad > MAX_PARRAFOS || largoUnidad > MAX_CARACTERES) enUnidad = false;
    }
    if (enUnidad) {
      quitadas += m ? 1 : 0;
      caracteresQuitados += parrafos[i].length;
      pendienteIndice = true;
      continue;
    }
    volcarIndice();
    salida.push(parrafos[i]);
  }
  volcarIndice();
  return { parrafos: salida, quitadas, caracteresQuitados };
}

/** Los fragmentos como un documento leído más (así llegan a la redacción y a las revisiones de linderos) */
export function documentoDeFragmentos(nombre: string, fragmentos: { unidad: Unidad; texto: string }[]): DocumentoLeido | null {
  if (!fragmentos.length) return null;
  return {
    tipo: `TEXTO EXACTO del Word «${nombre}» sobre las unidades de este negocio (copiado por el sistema, sin resumir)`,
    paginas: '',
    resumen: 'De aquí salen, al pie de la letra, la descripción, las dependencias, las áreas y los linderos de cada unidad; prevalece sobre lo resumido del mismo archivo.',
    fecha_documento: '',
    datos: [],
    textos_literales: fragmentos.map((f) => ({
      titulo: `${f.unidad.tipo} ${f.unidad.numero}${f.unidad.agrupacion ? ` ${f.unidad.agrupacion}` : ''} — descripción, dependencias, áreas y linderos`,
      texto: f.texto,
      pagina: 0,
    })),
    alertas: [],
  };
}
