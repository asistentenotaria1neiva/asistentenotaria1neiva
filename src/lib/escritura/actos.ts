/**
 * Actos de la escritura pedidos en las observaciones del digitador («en el primer acto se debe realizar
 * cancelación de hipoteca») frente a los encabezados de la escritura («PRIMER ACTO - COMPRAVENTA»).
 * Sin IA: sirve para pedirle a la corrección que cumpla la indicación y, si aun así no se cumplió,
 * avisarlo como crítica.
 */
import { normalizar } from '../texto/normalizar';

/** Nombres de actos, normalizados (sin tildes, en mayúscula). Se elige siempre el más largo que aparezca. */
const ACTOS = [
  'CANCELACION DE HIPOTECA', 'CANCELACION PARCIAL DE HIPOTECA', 'CANCELACION DE AMPLIACION DE HIPOTECA', 'AMPLIACION DE HIPOTECA',
  'HIPOTECA ABIERTA SIN LIMITE DE CUANTIA', 'HIPOTECA ABIERTA', 'HIPOTECA',
  'CANCELACION DE PATRIMONIO DE FAMILIA', 'CONSTITUCION DE PATRIMONIO DE FAMILIA', 'PATRIMONIO DE FAMILIA',
  'CANCELACION DE AFECTACION A VIVIENDA FAMILIAR', 'LEVANTAMIENTO DE AFECTACION A VIVIENDA FAMILIAR', 'AFECTACION A VIVIENDA FAMILIAR',
  'CANCELACION DE CONDICION RESOLUTORIA', 'CANCELACION DE USUFRUCTO', 'CONSTITUCION DE USUFRUCTO', 'USUFRUCTO',
  'CANCELACION DE PACTO DE RETROVENTA', 'CANCELACION DE LEASING', 'CANCELACION DE ANTICRESIS', 'CANCELACION DE SERVIDUMBRE', 'SERVIDUMBRE',
  'DECLARACION DE CONSTRUCCION', 'DECLARACION DE MEJORAS', 'ACTUALIZACION DE AREA', 'ACTUALIZACION DE LINDEROS', 'ACLARACION',
  'LIQUIDACION DE SOCIEDAD CONYUGAL', 'LIQUIDACION DE SOCIEDAD PATRIMONIAL', 'DACION EN PAGO', 'COMPRAVENTA', 'DONACION', 'PERMUTA',
  'ENGLOBE', 'DESENGLOBE', 'LOTEO', 'DIVISION MATERIAL', 'CESION DE DERECHOS', 'RESTITUCION', 'CONSTITUCION DE PROPIEDAD HORIZONTAL',
].sort((a, b) => b.length - a.length);

const ORDINALES: Record<string, number> = { PRIMER: 1, PRIMERO: 1, SEGUNDO: 2, TERCER: 3, TERCERO: 3, CUARTO: 4, QUINTO: 5, SEXTO: 6 };
const NOMBRE_ORDINAL = ['', 'PRIMER', 'SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO', 'SEXTO'];
const ORDINAL = '(PRIMER|PRIMERO|SEGUNDO|TERCER|TERCERO|CUARTO|QUINTO|SEXTO)';
const ORDINAL_ACTO = new RegExp(`\\b${ORDINAL}\\s+ACTO\\b|\\bACTO\\s+${ORDINAL}\\b`);
/** Encabezado de un acto: «PRIMER ACTO - COMPRAVENTA», «SEGUNDO ACTO: HIPOTECA», «ACTO PRIMERO. …» */
const ENCABEZADO = new RegExp(`^(?:${ORDINAL}\\s+ACTO|ACTO\\s+${ORDINAL})\\b\\s*[-–—:.]*\\s*(.*)$`);
/** Verbos con los que se pide un acto sin decir su lugar («realizar cancelación de hipoteca») */
const PEDIDO = /\b(REALIZA|HACE|HACER|AGREGA|INCLU|ADICION|ANADI|ANEXA|ELABORA|INCORPORA|LLEVA|DEBE|VA\b|CONTIENE|TIENE QUE)/;

/** El acto más largo que se nombra en el texto (normalizado), o null */
function actoEn(t: string): string | null {
  return ACTOS.find((a) => new RegExp(`\\b${a}\\b`).test(t)) ?? null;
}

/** Mismo acto aunque cambie la variante: «HIPOTECA ABIERTA SIN LIMITE DE CUANTIA» es HIPOTECA; «CANCELACION DE AMPLIACION DE HIPOTECA», CANCELACION DE HIPOTECA */
const familia = (a: string) => a.replace(/ PARCIAL\b/, '').replace(/\bAMPLIACION DE /, '').replace(/ ABIERTA\b.*$/, '');
const mismoActo = (a: string, b: string) => familia(a) === familia(b);

/** El renglón nombra el acto en sus primeras palabras (un encabezado o un rótulo «CANCELACIÓN DE HIPOTECA: Presente, …») */
export function nombraActo(renglon: string, acto: string): boolean {
  const inicio = normalizar(renglon.replace(/\*\*/g, '')).slice(0, 80);
  const a = actoEn(inicio.replace(ORDINAL_ACTO, ' '));
  return Boolean(a && mismoActo(a, acto));
}

export interface ActoPedido { acto: string; posicion: number | null; texto: string }
export interface Encabezado { posicion: number; acto: string; texto: string; p: number }

/** Actos que piden las observaciones, con su posición si la dicen («primer acto») */
export function actosPedidos(observaciones: string | null | undefined): ActoPedido[] {
  if (!observaciones?.trim()) return [];
  const frases = observaciones.split(/[.;\n]+/).map((f) => f.trim()).filter(Boolean);
  const pedidos: ActoPedido[] = [];
  let ultimo: string | null = null;
  for (const frase of frases) {
    const n = normalizar(frase);
    const acto = actoEn(n.replace(ORDINAL_ACTO, ' '));
    const o = n.match(ORDINAL_ACTO);
    const posicion = o ? ORDINALES[o[1] ?? o[2]] : null;
    // «… y déjelo como primer acto»: el acto es el que se nombró antes
    const elegido = acto ?? (posicion ? ultimo : null);
    if (elegido && (posicion || PEDIDO.test(n))) {
      const previo = pedidos.find((x) => x.acto === elegido);
      if (previo) { if (posicion) { previo.posicion = posicion; previo.texto = frase; } }
      else pedidos.push({ acto: elegido, posicion, texto: frase });
    }
    if (acto) ultimo = acto;
  }
  return pedidos;
}

/** Encabezados de los actos en los párrafos de la escritura, en orden (`[n, texto]`; los insertados van en renglones del mismo texto) */
export function encabezadosDeActos(parrafos: Iterable<[number, string]>): Encabezado[] {
  const lista: Encabezado[] = [];
  for (const [p, texto] of [...parrafos].sort((a, b) => a[0] - b[0])) {
    for (const renglon of texto.split('\n')) {
      const n = normalizar(renglon.replace(/\*\*/g, '').replace(/^\+\s*/, ''));
      const m = n.length <= 160 ? n.match(ENCABEZADO) : null;
      if (m) lista.push({ posicion: ORDINALES[m[1] ?? m[2]], acto: actoEn(m[3]) ?? m[3], texto: renglon.replace(/\*\*/g, '').trim(), p });
    }
  }
  return lista;
}

/** Lo que de las observaciones sobre los actos no se cumplió en la escritura */
export function actosSinCumplir(pedidos: ActoPedido[], encabezados: Encabezado[], escritura: string): string[] {
  const problemas: string[] = [];
  const texto = normalizar(escritura);
  for (const x of pedidos) {
    if (x.posicion) {
      const en = encabezados.find((e) => e.posicion === x.posicion);
      if (en && mismoActo(en.acto, x.acto)) continue;
      const donde = encabezados.find((e) => mismoActo(e.acto, x.acto));
      problemas.push(`Las observaciones piden «${x.texto}» (${x.acto} como ${NOMBRE_ORDINAL[x.posicion] ?? x.posicion} ACTO), pero ${en ? `el ${NOMBRE_ORDINAL[x.posicion]} ACTO es «${en.texto}»` : `la escritura no tiene ${NOMBRE_ORDINAL[x.posicion]} ACTO`}${donde ? ` y ${x.acto} quedó como «${donde.texto}»` : ''}.`);
    } else if (encabezados.length ? !encabezados.some((e) => mismoActo(e.acto, x.acto)) : !new RegExp(`\\b${x.acto}\\b`).test(texto)) {
      problemas.push(`Las observaciones piden «${x.texto}», pero la escritura no tiene un acto de ${x.acto}${encabezados.length ? ` (sus actos son: ${encabezados.map((e) => e.texto).join('; ')})` : ''}.`);
    }
  }
  return problemas;
}
