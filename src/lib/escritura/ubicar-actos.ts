/**
 * Cumplimiento obligatorio de los actos que piden las observaciones del digitador («en el primer acto se
 * debe realizar cancelación de hipoteca»). Sin IA y sobre los cambios ya redactados: si la IA no dejó el
 * acto donde se pidió, el sistema edita la estructura de la plantilla él mismo:
 *
 *   1. Ubica el acto: lo que la IA haya escrito de ese acto en otro lugar se mueve al párrafo que va
 *      justo antes del acto que hoy ocupa esa posición (la introducción «En la ciudad de Neiva…» si va
 *      primero). Si la IA no escribió nada, queda el encabezado para que se redacte.
 *   2. Encabezado: el bloque empieza con «**PRIMER ACTO - CANCELACIÓN DE HIPOTECA**» (con el separador
 *      de los encabezados de la plantilla).
 *   3. Renumera los encabezados de los demás actos («PRIMER ACTO - COMPRAVENTA» → «SEGUNDO ACTO - …»).
 *   4. Carátula: agrega el renglón del acto en «ESPECIFICACION VALOR DEL ACTO», en su orden.
 *
 * Devuelve los cambios corregidos y los actos que quedaron sin redactar completos (menos de
 * MINIMO_PARRAFOS párrafos), para que la generación le pida a la IA solo ese acto. Es idempotente:
 * aplicada otra vez sobre su propio resultado no cambia nada.
 */
import type { CambioParrafo } from './docx';
import { normalizar } from '../texto/normalizar';
import { ENCABEZADO, NOMBRE_ORDINAL, ORDINALES, actoEn, encabezadosDeActos, mismoActo, nombraActo, type ActoPedido, type Encabezado } from './actos';

/** Párrafos (sin el encabezado) por debajo de los cuales un acto agregado se considera incompleto */
export const MINIMO_PARRAFOS = 3;

/** Actos que, si no dicen su lugar, van primero (se cancela o levanta antes de transferir) */
const VAN_PRIMERO = /^(CANCELACION|LEVANTAMIENTO)\b/;

const TILDES: [RegExp, string][] = [
  [/CION\b/g, 'CIÓN'], [/\bCUANTIA\b/g, 'CUANTÍA'], [/\bLIMITE\b/g, 'LÍMITE'], [/\bDACION\b/g, 'DACIÓN'],
];
/** Nombre del acto para el encabezado, con sus tildes («CANCELACION DE HIPOTECA» → «CANCELACIÓN DE HIPOTECA») */
export const tituloActo = (acto: string) => TILDES.reduce((t, [a, b]) => t.replace(a, b), acto);

/** Ordinal pospuesto («ACTO PRIMERO») */
const POSPUESTO = ['', 'PRIMERO', 'SEGUNDO', 'TERCERO', 'CUARTO', 'QUINTO', 'SEXTO'];
const ORDINAL_CRUDO = /\b(PRIMER|PRIMERO|SEGUNDO|TERCER|TERCERO|CUARTO|QUINTO|SEXTO)(\s+ACTO)\b|\b(ACTO\s+)(PRIMERO|PRIMER|SEGUNDO|TERCERO|TERCER|CUARTO|QUINTO|SEXTO)\b/i;

/** Cambia el ordinal de un encabezado conservando su forma («PRIMER ACTO» o «ACTO PRIMERO») y su caja */
export function renumerar(texto: string, posicion: number): string {
  return texto.replace(ORDINAL_CRUDO, (m, a, b, c) => {
    const nuevo = a ? `${NOMBRE_ORDINAL[posicion]}${b}` : `${c}${POSPUESTO[posicion]}`;
    return m === m.toUpperCase() ? nuevo.toUpperCase() : nuevo.toLowerCase().replace(/^\w/, (x) => x.toUpperCase());
  });
}

/** Encabezado de acto en un renglón («**SEGUNDO ACTO - HIPOTECA**»), o null */
function encabezadoDe(renglon: string): { posicion: number; acto: string } | null {
  const n = normalizar(renglon.replace(/\*\*/g, '').replace(/^\+\s*/, ''));
  const m = n.length <= 160 ? n.match(ENCABEZADO) : null;
  return m ? { posicion: ORDINALES[m[1] ?? m[2]], acto: actoEn(m[3]) ?? m[3] } : null;
}

/** El renglón es del acto: su encabezado o un rótulo que lo nombra al empezar («CANCELACIÓN DE HIPOTECA: Presente, …») */
const esDelActo = (renglon: string, acto: string) => {
  const e = encabezadoDe(renglon);
  return e ? mismoActo(e.acto, acto) : nombraActo(renglon, acto);
};

/** Texto de un párrafo de la plantilla con el cambio de la IA (lo necesario para leer su encabezado) */
function textoCon(original: string, c: CambioParrafo | undefined): string {
  if (!c) return original;
  if (c.accion === 'REESCRIBIR') return c.texto;
  if (c.accion === 'ELIMINAR') return '';
  return c.reemplazos.reduce((t, r) => (r.original ? t.split(r.original).join(r.nuevo) : t), original);
}

/** Separador entre «PRIMER ACTO» y el nombre del acto en los encabezados de la plantilla (« - » por defecto) */
function separador(plantilla: Map<number, string>, encabezados: Encabezado[]): string {
  for (const e of encabezados) {
    const m = (plantilla.get(e.p) ?? '').replace(/\*\*/g, '').match(/\bACTO\b(?:\s+(?:PRIMERO|PRIMER|SEGUNDO|TERCERO|TERCER|CUARTO|QUINTO|SEXTO))?(\s*[-–—:.]+\s*)/i);
    if (m) return m[1];
  }
  return ' - ';
}

export interface ActoPorRedactar {
  pedido: ActoPedido;
  /** Párrafo de la plantilla tras el cual va el acto (su bloque es el inicio de sus "insertar_despues") */
  ancla: number;
  /** Encabezado del acto que queda después («SEGUNDO ACTO - COMPRAVENTA»), para orientar la redacción */
  antesDe: string;
  encabezado: string;
  /** Renglones del bloque (encabezado incluido) tal como quedaron */
  bloque: string[];
}

export interface Ubicacion {
  cambios: CambioParrafo[];
  porRedactar: ActoPorRedactar[];
  /** Qué hizo el sistema (para una advertencia informativa) */
  hechos: string[];
}

/** El párrafo de la carátula con «ESPECIFICACION VALOR DEL ACTO» y sus renglones */
function zonaCaratula(plantilla: Map<number, string>): { rotulo: number; renglones: number[] } | null {
  const lista = [...plantilla].sort((a, b) => a[0] - b[0]);
  const i = lista.findIndex(([, t]) => /ESPECIFICACION\s+VALOR\s+DEL\s+ACTO/.test(normalizar(t)));
  if (i < 0) return null;
  const renglones: number[] = [];
  for (const [n, t] of lista.slice(i + 1, i + 10)) {
    const s = normalizar(t).trim();
    if (!s) { if (renglones.length) break; continue; }
    if (/^(MATRICULA|CEDULA CATASTRAL|NOMBRE O DIRECCION|OFICINA DE REGISTRO|PERSONAS QUE)/.test(s)) break;
    renglones.push(n);
  }
  return { rotulo: lista[i][0], renglones };
}

export function ubicarActos(
  pedidosIniciales: ActoPedido[],
  plantilla: Map<number, string>,
  cambiosIniciales: CambioParrafo[],
): Ubicacion {
  const cambios = cambiosIniciales.map((c) => ({ ...c, reemplazos: [...c.reemplazos], insertar_despues: [...c.insertar_despues] }));
  const hechos: string[] = [];
  const porRedactar: ActoPorRedactar[] = [];
  const dePlantilla = encabezadosDeActos(plantilla);
  if (!dePlantilla.length) return { cambios, porRedactar, hechos };

  // Posición de cada acto pedido (una cancelación sin lugar va primero); solo los que no trae la plantilla
  const pedidos = pedidosIniciales
    .map((x) => ({ ...x, posicion: x.posicion ?? (VAN_PRIMERO.test(x.acto) ? 1 : null) }))
    .filter((x): x is ActoPedido & { posicion: number } => x.posicion !== null && x.posicion <= dePlantilla.length)
    .filter((x) => !dePlantilla.some((e) => mismoActo(e.acto, x.acto)))
    .sort((a, b) => a.posicion - b.posicion);
  if (!pedidos.length) return { cambios, porRedactar, hechos };

  const cambioDe = (p: number, crear: boolean): CambioParrafo | undefined => {
    let c = cambios.find((x) => x.p === p);
    if (!c && crear) { c = { p, accion: 'SOLO_INSERTAR', reemplazos: [], texto: '', insertar_despues: [] }; cambios.push(c); }
    return c;
  };
  const anterior = (n: number) => Math.max(0, ...[...plantilla].filter(([m, t]) => m < n && t.trim()).map(([m]) => m));
  const sep = separador(plantilla, dePlantilla);
  const caratula = zonaCaratula(plantilla);
  const finCaratula = caratula ? Math.max(caratula.rotulo, ...caratula.renglones) : 0;

  for (const x of pedidos) {
    const ocupa = dePlantilla.find((e) => e.posicion === x.posicion)!;
    const ancla = anterior(ocupa.p);
    if (!ancla) continue;
    const encabezado = `**${NOMBRE_ORDINAL[x.posicion]} ACTO${sep}${tituloActo(x.acto)}**`;

    // 1. Lo que la IA escribió de este acto (fuera de la carátula): desde su primer renglón hasta el
    //    encabezado de otro acto o el final de esas inserciones
    let bloque: string[] = [];
    let enSuLugar = 0; // renglones del bloque que ya están al inicio de las inserciones del ancla
    for (const c of [...cambios].sort((a, b) => a.p - b.p)) {
      if (c.p <= finCaratula) continue;
      const i = c.insertar_despues.findIndex((l) => esDelActo(l, x.acto));
      if (i < 0) continue;
      let j = c.insertar_despues.findIndex((l, k) => k > i && encabezadoDe(l) && !esDelActo(l, x.acto));
      if (j < 0) j = c.insertar_despues.length;
      if (c.p === ancla && i === 0) { bloque = c.insertar_despues.slice(0, j); enSuLugar = j; break; }
      bloque = c.insertar_despues.splice(i, j - i);
      hechos.push(`movió el acto de ${tituloActo(x.acto)}, que la IA había dejado después del párrafo ${c.p}, al lugar pedido`);
      break;
    }

    // 2. El bloque empieza con su encabezado, con el ordinal pedido
    const primero = bloque[0] ? encabezadoDe(bloque[0]) : null;
    if (primero && mismoActo(primero.acto, x.acto)) {
      if (primero.posicion !== x.posicion) bloque[0] = renumerar(bloque[0], x.posicion);
    } else {
      bloque.unshift(encabezado);
      hechos.push(`puso el encabezado «${encabezado.replace(/\*\*/g, '')}»`);
    }
    cambioDe(ancla, true)!.insertar_despues.splice(0, enSuLugar, ...bloque);
    if (bloque.length - 1 < MINIMO_PARRAFOS) {
      porRedactar.push({ pedido: x, ancla, antesDe: (plantilla.get(ocupa.p) ?? '').replace(/\*\*/g, '').trim(), encabezado, bloque: [...bloque] });
    }

    // 4. Carátula: el renglón del acto en su orden
    if (caratula?.renglones.length) {
      const nombrado = (n: number) => {
        const c = cambioDe(n, false);
        return [textoCon(plantilla.get(n) ?? '', c), ...(c?.insertar_despues ?? [])].some((t) => new RegExp(`\\b${x.acto}\\b`).test(normalizar(t)));
      };
      if (![caratula.rotulo, ...caratula.renglones].some(nombrado)) {
        const base = plantilla.get(caratula.renglones[0]) ?? '';
        const m = base.match(/^(.+?)([\t ]+)(\$\s?[\d.,]+|SIN CUANT[IÍ]A)\s*$/i);
        const renglon = `${x.acto}${m ? m[2] : '\t'}«EN BLANCO»`;
        const despues = x.posicion === 1 ? caratula.rotulo : caratula.renglones[Math.min(x.posicion - 2, caratula.renglones.length - 1)];
        cambioDe(despues, true)!.insertar_despues.unshift(renglon);
        hechos.push(`agregó el renglón «${x.acto}» en la especificación de los actos de la carátula`);
      }
    }
  }

  // 3. Renumera los encabezados de la plantilla según el orden nuevo
  const orden: ({ plantilla: Encabezado } | { pedido: true })[] = dePlantilla.map((e) => ({ plantilla: e }));
  for (const x of pedidos) orden.splice(x.posicion - 1, 0, { pedido: true });
  const renumerados: string[] = [];
  orden.forEach((o, i) => {
    if (!('plantilla' in o)) return;
    const e = o.plantilla;
    const esperado = i + 1;
    const c = cambioDe(e.p, false);
    const actual = encabezadoDe(textoCon(plantilla.get(e.p) ?? '', c));
    if (actual?.posicion === esperado) return;
    if (c?.accion === 'REESCRIBIR') { c.texto = renumerar(c.texto, esperado); }
    else {
      const original = (plantilla.get(e.p) ?? '').match(ORDINAL_CRUDO)?.[0];
      if (!original) return;
      const cc = cambioDe(e.p, true)!;
      if (cc.accion === 'SOLO_INSERTAR') cc.accion = 'REEMPLAZAR';
      // Fuera los reemplazos de la IA sobre el ordinal (pudo renumerar mal)
      cc.reemplazos = cc.reemplazos.filter((r) => !ORDINAL_CRUDO.test(r.original));
      cc.reemplazos.unshift({ original, nuevo: renumerar(original, esperado) });
    }
    renumerados.push(`«${e.texto}» → ${NOMBRE_ORDINAL[esperado]} ACTO`);
  });
  if (renumerados.length) hechos.push(`renumeró ${renumerados.join(', ')}`);

  return { cambios: cambios.sort((a, b) => a.p - b.p), porRedactar, hechos };
}
