/**
 * La plantilla en Word como lista de párrafos numerados, y los cambios de la IA aplicados sobre ella.
 *
 * La IA no reescribe la escritura: recibe los párrafos numerados de la plantilla (sin los guiones de
 * relleno, que solo gastan tokens) y devuelve SOLO los cambios: fragmentos a reemplazar en un párrafo,
 * párrafos reescritos, párrafos que se eliminan y párrafos nuevos que se insertan después de otro
 * (con el formato de ese párrafo). Todo lo demás queda exactamente como en la plantilla: estructura,
 * estilos, tablas, encabezados, imágenes y campos.
 *
 * Un reemplazo deja el texto nuevo en la primera corrida (<w:r>) que toca el fragmento, con su formato.
 * Las marcas «FALTA: …» y [VERIFICAR: …] quedan resaltadas en amarillo; **así** va en negrilla.
 * Al final se aplica el formato de impresión de la notaría (formato-notarial.ts), que recalcula los
 * guiones de relleno de cada párrafo.
 */
import PizZip from 'pizzip';
import { aplicarAjustesNotariales, aplicarEstilosNotariales, aplicarFormatoNotarial, aplicarMargenes, anchoTextoDe, rellenarParrafo, tabDerecha } from './formato-notarial';

const decodificar = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Caracteres que Word no admite en el XML (controles distintos de tabulación y salto)
const limpiar = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\r\n?/g, '\n');

export class ErrorDocx extends Error {}

// ------------------------------------------------------------------ lectura

interface Run {
  inicio: number;
  fin: number;
  rPr: string;
  /** null: corrida que no es solo texto (campo, imagen, salto de página…): se conserva tal cual */
  texto: string | null;
}

export interface ParrafoDocx {
  /** Número del párrafo en el documento (1 = primero) */
  n: number;
  inicio: number;
  fin: number;
  xml: string;
  enTabla: boolean;
  /** Con cuadros de texto o contenido alternativo: no se toca */
  editable: boolean;
  runs: Run[];
  texto: string;
}

/** Propiedades de una corrida (<w:rPr>…</w:rPr>, que puede traer un <w:rPrChange> con otro <w:rPr> dentro) */
function rPrDe(corrida: string): string {
  const inicio = corrida.match(/^<w:r\b[^>]*>\s*/)?.[0].length ?? 0;
  const resto = corrida.slice(inicio);
  if (!resto.startsWith('<w:rPr>')) return '';
  const cambio = resto.indexOf('</w:rPrChange>');
  const fin = resto.indexOf('</w:rPr>', cambio < 0 ? 0 : cambio + 14);
  return fin < 0 ? '' : resto.slice(0, fin + 8);
}

const PIEZA = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t(?:\s[^>]*)?\/>|<w:tab\/>|<w:br\/>|<w:cr\/>|<w:lastRenderedPageBreak\/>|<w:noBreakHyphen\/>|<w:softHyphen\/>/g;

function leerRun(xml: string, inicio: number): Run {
  if (xml.endsWith('/>') && !xml.includes('</w:r>')) return { inicio, fin: inicio + xml.length, rPr: '', texto: '' };
  const abre = /^<w:r\b[^>]*>/.exec(xml)?.[0] ?? '';
  const rPr = rPrDe(xml);
  let resto = xml.slice(abre.length, xml.length - '</w:r>'.length).replace(/^\s+/, '');
  if (rPr) resto = resto.slice(rPr.length);
  else if (resto.startsWith('<w:rPr/>')) resto = resto.slice('<w:rPr/>'.length);
  let texto = '';
  const queda = resto.replace(PIEZA, (m, t: string | undefined) => {
    if (t !== undefined) texto += decodificar(t);
    else if (m.startsWith('<w:tab')) texto += '\t';
    else if (m.startsWith('<w:br') || m.startsWith('<w:cr')) texto += '\n';
    else if (m.startsWith('<w:noBreakHyphen')) texto += '-';
    return '';
  });
  return { inicio, fin: inicio + xml.length, rPr, texto: queda.trim() ? null : texto };
}

function leerParrafo(xml: string, n: number, inicio: number, enTabla: boolean): ParrafoDocx {
  const editable = !/<w:txbxContent|<mc:AlternateContent/.test(xml);
  const runs = editable ? [...xml.matchAll(/<w:r[ >][\s\S]*?<\/w:r>|<w:r\/>/g)].map((m) => leerRun(m[0], m.index)) : [];
  return { n, inicio, fin: inicio + xml.length, xml, enTabla, editable, runs, texto: runs.map((r) => r.texto ?? '').join('') };
}

/** Fin del párrafo que empieza en `desde` (contando los párrafos anidados en cuadros de texto) */
function finParrafo(xml: string, desde: number): number {
  const re = /<w:p[ >]|<\/w:p>/g;
  re.lastIndex = desde;
  let nivel = 0;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    nivel += m[0] === '</w:p>' ? -1 : 1;
    if (nivel === 0) return m.index + m[0].length;
  }
  return -1;
}

/** Párrafos del cuerpo del documento, en orden (también los de las tablas) */
export function parrafosDe(xml: string): ParrafoDocx[] {
  const cuerpo = xml.indexOf('<w:body>');
  if (cuerpo < 0) throw new ErrorDocx('El archivo no tiene el documento principal de Word.');
  const lista: ParrafoDocx[] = [];
  const re = /<w:tbl[ >]|<\/w:tbl>|<w:p[ >]/g;
  re.lastIndex = cuerpo;
  let tablas = 0;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[0].startsWith('<w:tbl')) { tablas++; continue; }
    if (m[0] === '</w:tbl>') { tablas = Math.max(0, tablas - 1); continue; }
    const fin = finParrafo(xml, m.index);
    if (fin < 0) break;
    lista.push(leerParrafo(xml.slice(m.index, fin), lista.length + 1, m.index, tablas > 0));
    re.lastIndex = fin;
  }
  return lista;
}

/** document.xml de un .docx; ErrorDocx si el archivo no es un Word (.docx) válido */
export function documentoXml(docx: Buffer): string {
  let zip: PizZip;
  try { zip = new PizZip(docx); } catch { throw new ErrorDocx('El archivo no es un documento de Word (.docx) válido.'); }
  const xml = zip.file('word/document.xml')?.asText();
  if (!xml || !xml.includes('<w:body>')) throw new ErrorDocx('El archivo no es un documento de Word (.docx) válido.');
  return xml;
}

/** Guiones de relleno, al final de un renglón o en medio del párrafo (los recalcula el formato de la notaría) */
const RELLENO = /[ \t]*-{3,}[ \t]*/g;
const soloGuiones = (t: string) => /^[\s\-_]*$/.test(t) && /-{3,}/.test(t);

/** Texto de un párrafo como lo ve la IA: sin guiones de relleno ni espacios repetidos */
export function textoParaIA(texto: string): string {
  return texto.replace(RELLENO, ' ').replace(/ +\n/g, '\n').replace(/\t/g, ' ').replace(/[ \u00a0]{2,}/g, ' ').trim();
}

/**
 * Los párrafos de la plantilla para la IA, numerados («[12] texto»). Se omiten los vacíos, las líneas
 * de guiones y los que no se pueden editar. Devuelve también cuántos se enviaron.
 */
export function plantillaNumerada(docx: Buffer): { texto: string; parrafos: number; caracteres: number } {
  const lineas: string[] = [];
  for (const p of parrafosDe(documentoXml(docx))) {
    if (!p.editable || soloGuiones(p.texto)) continue;
    const t = textoParaIA(p.texto);
    if (!t) continue;
    lineas.push(`[${p.n}]${p.enTabla ? ' (tabla)' : ''} ${t.replace(/\n/g, '\n  ')}`);
  }
  const texto = lineas.join('\n');
  return { texto, parrafos: lineas.length, caracteres: texto.length };
}

/** Texto plano del documento (búsqueda, verificaciones): un párrafo por renglón */
export function textoDocx(docx: Buffer): string {
  return parrafosDe(documentoXml(docx)).map((p) => textoParaIA(p.texto)).filter(Boolean).join('\n');
}

/** Texto de cada párrafo por su número (para comparar la plantilla con la escritura generada) */
export function textosPorParrafo(docx: Buffer): Map<number, string> {
  return new Map(parrafosDe(documentoXml(docx)).map((p) => [p.n, textoParaIA(p.texto)]));
}

// ------------------------------------------------------------------ escritura

/** Orden de las propiedades de una corrida en el esquema de Word (fuera de orden, Word puede no abrir el archivo) */
const ORDEN_RPR = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'];
const posicion = (nombre: string) => { const i = ORDEN_RPR.indexOf(nombre); return i < 0 ? Infinity : i; };

/** Las propiedades de la corrida con las de `agregar` puestas en su lugar (sin el historial de cambios de Word) */
export function conFormato(rPr: string, agregar: Record<string, string>): string {
  const interior = rPr.match(/^<w:rPr>([\s\S]*)<\/w:rPr>$/)?.[1] ?? '';
  const hijos = [...interior.matchAll(/<w:(\w+)\b(?:[^>]*?\/>|[^>]*>[\s\S]*?<\/w:\1>)/g)]
    .map((m) => ({ nombre: m[1], xml: m[0] }))
    .filter((h) => h.nombre !== 'rPrChange' && !(h.nombre in agregar));
  for (const [nombre, xml] of Object.entries(agregar)) {
    const k = hijos.findIndex((h) => posicion(h.nombre) > posicion(nombre));
    hijos.splice(k < 0 ? hijos.length : k, 0, { nombre, xml });
  }
  return hijos.length ? `<w:rPr>${hijos.map((h) => h.xml).join('')}</w:rPr>` : '';
}

const MARCAS = /(«FALTA:[^»]*»|\[VERIFICAR:[^\]]*\])/;
const NEGRILLA = { b: '<w:b/>', bCs: '<w:bCs/>' };
const RESALTADO = { highlight: '<w:highlight w:val="yellow"/>' };

/**
 * La IA no siempre escribe las marcas igual: «FALTA: x», [FALTA: x], <<FALTA: x>> o (FALTA: x); lo
 * mismo con VERIFICAR. Todas se llevan a la forma única («FALTA: x» y [VERIFICAR: x]).
 */
export function normalizarMarcas(s: string): string {
  const forma = (m: string, nombre: string, dato: string) => {
    const d = dato.trim().replace(/\s+/g, ' ');
    if (!d) return m;
    return nombre.toUpperCase() === 'FALTA' ? `«FALTA: ${d}»` : `[VERIFICAR: ${d}]`;
  };
  return s
    .replace(/«\s*(FALTA|VERIFICAR)\s*:\s*([^»]*)»/gi, (m, n, d) => forma(m, n, d))
    .replace(/\[\s*(FALTA|VERIFICAR)\s*:\s*([^\]]*)\]/gi, (m, n, d) => forma(m, n, d))
    .replace(/<<\s*(FALTA|VERIFICAR)\s*:\s*([\s\S]*?)>>/gi, (m, n, d) => forma(m, n, d))
    .replace(/\(\s*(FALTA|VERIFICAR)\s*:\s*([^)]*)\)/gi, (m, n, d) => forma(m, n, d))
    // Sin nada alrededor (en mayúsculas, para no tomar el verbo «falta»): hasta el fin de la frase
    .replace(/(^|[^«[(<A-ZÁÉÍÓÚÑ])(FALTA|VERIFICAR):\s*([^.,;:\n«»[\]]+)/g, (m, antes, n, d) => `${antes}${forma(m, n, d)}`);
}

const contenido = (t: string) => t.split(/(\n|\t)/).map((x) => (x === '\n' ? '<w:br/>' : x === '\t' ? '<w:tab/>' : x ? `<w:t xml:space="preserve">${escapar(x)}</w:t>` : '')).join('');

/** Corridas para un texto con el formato `rPr`: **negrilla** y las marcas resaltadas */
export function runsDe(rPr: string, texto: string): string {
  const limpio = normalizarMarcas(limpiar(texto));
  return limpio.split('**').flatMap((tramo, i) => tramo.split(MARCAS).map((x) => {
    if (!x) return '';
    const marca = MARCAS.test(x);
    const props = { ...(i % 2 === 1 || x.startsWith('«FALTA:') ? NEGRILLA : {}), ...(marca ? RESALTADO : {}) };
    const c = contenido(x);
    return c ? `<w:r>${Object.keys(props).length ? conFormato(rPr, props) : rPr}${c}</w:r>` : '';
  })).join('');
}

/** pPr del párrafo (puede traer un <w:pPrChange> con otro <w:pPr> dentro) */
function pPrDe(parrafo: string): string {
  const abre = /^<w:p\b[^>]*>/.exec(parrafo)?.[0].length ?? 0;
  const resto = parrafo.slice(abre);
  if (resto.startsWith('<w:pPr/>')) return '<w:pPr/>';
  if (!resto.startsWith('<w:pPr>')) return '';
  const cambio = resto.indexOf('</w:pPrChange>');
  const fin = resto.indexOf('</w:pPr>', cambio < 0 ? 0 : cambio + 15);
  return fin < 0 ? '' : resto.slice(0, fin + 8);
}

const esNegrilla = (rPr: string) => /<w:b\/>|<w:b w:val="(?:1|true|on)"\/>/.test(rPr);

/** La corrida que da el formato a un párrafo reescrito: la de más texto (mejor si no va en negrilla) */
function corridaBase(runs: Run[]): number {
  let mejor = -1, puntaje = -1;
  runs.forEach((r, i) => {
    if (r.texto === null) return;
    const p = r.texto.length + (esNegrilla(r.rPr) ? 0 : 100_000);
    if (p > puntaje) { puntaje = p; mejor = i; }
  });
  return mejor;
}

/** Letras y signos que se consideran iguales al ubicar un fragmento (la IA puede copiarlos distinto) */
const EQUIVALENTES = ['aáàäâ', 'eéèëê', 'iíìïî', 'oóòöô', 'uúùüû', 'nñ', '"“”«»', "'‘’´`", '-‐‑–—'];
const CLASE = new Map(EQUIVALENTES.flatMap((g) => [...g].map((c) => [c, `[${g.replace(/[\]\\^-]/g, '\\$&')}]`] as const)));
const caracter = (c: string) => CLASE.get(c.toLowerCase()) ?? c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Expresión que ubica el fragmento tolerando mayúsculas, tildes, comillas, guiones y espacios, y los
 * guiones de relleno que la IA no vio (se le envía el texto sin ellos)
 */
export function patronFragmento(fragmento: string): RegExp {
  const palabras = fragmento.trim().split(/\s+/).filter(Boolean);
  return new RegExp(palabras.map((p) => [...p].map(caracter).join('')).join('(?:[\\s\\u00a0]|-{3,})+'), 'giu');
}

/** Reemplaza [a, b) del texto del párrafo; el texto nuevo queda en la primera corrida que toca */
function reemplazarRango(textos: (string | null)[], a: number, b: number, nuevo: string): void {
  let pos = 0, primero = true;
  for (let i = 0; i < textos.length; i++) {
    const t = textos[i];
    if (t === null) continue;
    const ini = pos, fin = pos + t.length;
    pos = fin;
    if (fin <= a || ini >= b) continue;
    const x = Math.max(a, ini) - ini, y = Math.min(b, fin) - ini;
    textos[i] = t.slice(0, x) + (primero ? nuevo : '') + t.slice(y);
    primero = false;
  }
}

export type Accion = 'REEMPLAZAR' | 'REESCRIBIR' | 'ELIMINAR' | 'SOLO_INSERTAR';

/** Un cambio de la IA sobre un párrafo de la plantilla */
export interface CambioParrafo {
  p: number;
  accion: Accion;
  reemplazos: { original: string; nuevo: string }[];
  texto: string;
  insertar_despues: string[];
}

export interface NoAplicado { p: number; original: string; motivo: string }

export interface ResultadoCambios {
  docx: Buffer;
  aplicados: number;
  noAplicados: NoAplicado[];
  eliminados: number;
  insertados: number;
  /** Texto final de cada párrafo cambiado de la plantilla (con los insertados después, uno por renglón; '' si se eliminó) */
  textos: Map<number, string>;
  /** Reemplazos que no estaban en su párrafo y se aplicaron en otro (la IA se equivocó de número) */
  reubicados: number;
}

/** Párrafos (vecinos primero) donde aparece un fragmento que la IA ubicó en otro número */
function parrafoCon(fragmento: string, n: number, parrafos: ParrafoDocx[], porNumero: Map<number, ParrafoDocx>): number | null {
  const tiene = (p: ParrafoDocx | undefined) => !!p && p.editable && patronFragmento(fragmento).test(p.texto);
  // Un renglón «Hoja No …» o una línea de guiones puede partir un párrafo de la plantilla en dos
  for (let d = 1; d <= 6; d++) for (const k of [n + d, n - d]) if (tiene(porNumero.get(k))) return k;
  const todos = parrafos.filter(tiene);
  return todos.length === 1 ? todos[0].n : null;
}

const sinRelleno = (t: string) => t.replace(/[ \t]*-{3,}[ \t]*(?=\n)/g, '').replace(/[ \t]*-{3,}[ \t]*$/, '');

/** Párrafo nuevo con el formato del párrafo `base` */
function parrafoNuevo(base: ParrafoDocx, texto: string): string {
  const abre = /^<w:p\b[^>]*>/.exec(base.xml)?.[0] ?? '<w:p>';
  const pPr = pPrDe(base.xml).replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, '').replace(/<w:pPrChange\b[\s\S]*?<\/w:pPrChange>/g, '');
  const i = corridaBase(base.runs);
  return `${abre.replace(/\s+w14:paraId="[^"]*"|\s+w14:textId="[^"]*"/g, '')}${pPr}${runsDe(i >= 0 ? base.runs[i].rPr : '', texto)}</w:p>`;
}

/**
 * Renglón de la carátula con el valor alineado a la derecha con tabulaciones («REPRESENTADA POR … ⇥⇥ 1.075.212.554»,
 * «COMPRAVENTA ⇥⇥ $192.172.500»): grupo 1, el rótulo; grupo 2, el valor.
 */
const VALOR_TABULADO = /^(.+?)[\t ]*\t[\t ]*((?:NIT\.?\s*)?\d[\d.]*(?:-\d+)?|\$\s?[\d.]+|SIN CUANT[IÍ]A)\s*$/i;
const VALOR_NUEVO = /^(.+?)\s+((?:NIT\.?\s*)?(?:C\.?C\.?\s*)?\d[\d.]*(?:-\d+)?|\$\s?[\d.]+|SIN CUANT[IÍ]A|«FALTA:[^»]*»)\s*$/i;

/**
 * Un párrafo cambiado (o agregado después de `original`) con la forma que tenía en la plantilla:
 *  - si era un renglón de la carátula con el valor a la derecha, el valor nuevo queda contra el margen
 *    (las tabulaciones de la plantilla estaban medidas para otro nombre);
 *  - si terminaba con guiones de relleno, se recalculan para el texto nuevo;
 *  - si no, queda como lo dejó el cambio (sin guiones ni renglones que la plantilla no tenía).
 */
function comoEnLaPlantilla(original: ParrafoDocx, xml: string): string {
  if (!xml || original.enTabla) return xml;
  const ancho = anchoTextoDe();
  if (VALOR_TABULADO.test(original.texto.replace(/[ \t]*-{3,}[ \t]*$/, ''))) {
    const texto = leerParrafo(xml, 0, 0, false).texto.replace(/[ \t]*-{3,}[ \t]*$/, '');
    const v = VALOR_NUEVO.exec(texto);
    if (v) {
      const abre = /^<w:p\b[^>]*>/.exec(xml)?.[0] ?? '<w:p>';
      const pPr = pPrDe(xml);
      const rPr = original.runs.find((r) => r.texto?.trim())?.rPr ?? '';
      const derecho = Number(/<w:ind\b[^>]*\bw:right="(-?\d+)"/.exec(pPr)?.[1] ?? 0);
      return `${abre}${tabDerecha(pPr, ancho - derecho)}${runsDe(rPr, v[1].replace(/[\t ]+$/, ''))}<w:r>${rPr}<w:tab/></w:r>${runsDe(rPr, v[2])}</w:p>`;
    }
  }
  if (/-{3,}[ \t]*$/.test(original.texto) || /w:leader="hyphen"/.test(original.xml)) return rellenarParrafo(xml, ancho);
  return xml;
}

/** Aplica los cambios de un párrafo; devuelve su XML nuevo (vacío si se elimina) */
function editarParrafo(p: ParrafoDocx, c: CambioParrafo, noAplicados: NoAplicado[]): { xml: string; aplicados: number; eliminado: boolean } {
  const textos = p.runs.map((r) => r.texto);
  let aplicados = 0;
  if (c.accion === 'ELIMINAR') {
    // En una celda o con el fin de sección el párrafo se vacía (Word exige un párrafo por celda)
    if (!p.enTabla && !/<w:sectPr/.test(p.xml)) return { xml: '', aplicados: 1, eliminado: true };
    textos.forEach((t, i) => { if (t !== null) textos[i] = ''; });
    aplicados = 1;
  } else if (c.accion === 'REESCRIBIR' && c.texto.trim()) {
    const base = corridaBase(p.runs);
    if (base < 0) { noAplicados.push({ p: p.n, original: p.texto.slice(0, 80), motivo: 'El párrafo no tiene texto editable.' }); }
    else {
      textos.forEach((t, i) => { if (t !== null) textos[i] = i === base ? c.texto.trim() : ''; });
      aplicados = 1;
    }
  } else if (c.accion === 'REEMPLAZAR') {
    for (const r of c.reemplazos ?? []) {
      if (!r.original?.trim()) continue;
      const completo = textos.map((t) => t ?? '').join('');
      const encontrados = [...completo.matchAll(patronFragmento(r.original))];
      if (!encontrados.length) { noAplicados.push({ p: p.n, original: r.original.slice(0, 200), motivo: 'No se encontró el texto en el párrafo.' }); continue; }
      // De atrás hacia adelante: las posiciones anteriores no se mueven
      for (const m of encontrados.reverse()) reemplazarRango(textos, m.index, m.index + m[0].length, r.nuevo ?? '');
      aplicados++;
    }
  }
  if (!aplicados) return { xml: p.xml, aplicados: 0, eliminado: false };
  // Se rehacen solo las corridas que cambiaron; los guiones de relleno los recalcula el formato
  let xml = p.xml;
  const ultima = textos.reduce<number>((u, t, i) => (t !== null && t.trim() ? i : u), -1);
  for (let i = p.runs.length - 1; i >= 0; i--) {
    const r = p.runs[i];
    let t = textos[i];
    if (t === null || r.texto === null) continue;
    if (t !== r.texto) t = i === ultima ? sinRelleno(t) : t.replace(/[ \t]*-{3,}[ \t]*(?=\n)/g, '');
    if (t === r.texto) continue;
    xml = xml.slice(0, r.inicio) + runsDe(r.rPr, t) + xml.slice(r.fin);
  }
  return { xml, aplicados, eliminado: false };
}

/**
 * Aplica los cambios de la IA a la plantilla. Un número de párrafo que no existe o no es editable se
 * reporta como no aplicado; lo demás de la plantilla queda igual.
 */
export function aplicarCambios(docx: Buffer, cambios: CambioParrafo[]): ResultadoCambios {
  const zip = new PizZip(docx);
  let xml = documentoXml(docx);
  const parrafos = parrafosDe(xml);
  const porNumero = new Map(parrafos.map((p) => [p.n, p]));
  const noAplicados: NoAplicado[] = [];
  let aplicados = 0, eliminados = 0, insertados = 0;
  // Un cambio por párrafo (si la IA repite uno, se unen sus reemplazos e inserciones)
  const unidos = new Map<number, CambioParrafo>();
  for (const c of cambios) {
    if (!Number.isInteger(c?.p)) continue;
    const previo = unidos.get(c.p);
    if (!previo) { unidos.set(c.p, { ...c, reemplazos: [...(c.reemplazos ?? [])], insertar_despues: [...(c.insertar_despues ?? [])] }); continue; }
    if (c.accion === 'ELIMINAR' || c.accion === 'REESCRIBIR') Object.assign(previo, { accion: c.accion, texto: c.texto });
    else if (c.accion === 'REEMPLAZAR' && previo.accion !== 'ELIMINAR' && previo.accion !== 'REESCRIBIR') { previo.accion = 'REEMPLAZAR'; previo.reemplazos.push(...(c.reemplazos ?? [])); }
    previo.insertar_despues.push(...(c.insertar_despues ?? []));
  }
  // Un fragmento que no está en su párrafo se aplica en el vecino (o el único párrafo) que lo tiene
  let reubicados = 0;
  for (const c of [...unidos.values()]) {
    const p = porNumero.get(c.p);
    if (c.accion !== 'REEMPLAZAR' || !p?.editable) continue;
    c.reemplazos = c.reemplazos.filter((r) => {
      if (!r.original?.trim() || patronFragmento(r.original).test(p.texto)) return true;
      const destino = parrafoCon(r.original, c.p, parrafos, porNumero);
      if (destino === null) return true;
      let d = unidos.get(destino);
      if (d && (d.accion === 'ELIMINAR' || d.accion === 'REESCRIBIR')) return true;
      if (!d) { d = { p: destino, accion: 'REEMPLAZAR', reemplazos: [], texto: '', insertar_despues: [] }; unidos.set(destino, d); }
      d.accion = 'REEMPLAZAR';
      d.reemplazos.push(r);
      reubicados++;
      return false;
    });
  }
  const textos = new Map<number, string>();
  // De atrás hacia adelante, para que las posiciones en el XML sigan siendo válidas
  for (const c of [...unidos.values()].sort((a, b) => b.p - a.p)) {
    const p = porNumero.get(c.p);
    if (!p || !p.editable) { noAplicados.push({ p: c.p, original: '', motivo: p ? 'El párrafo no se puede editar (cuadro de texto).' : 'El párrafo no existe en la plantilla.' }); continue; }
    const r = editarParrafo(p, c, noAplicados);
    if (r.aplicados && !r.eliminado) r.xml = comoEnLaPlantilla(p, r.xml);
    const nuevos = (c.insertar_despues ?? []).filter((t) => typeof t === 'string' && t.trim()).map((t) => comoEnLaPlantilla(p, parrafoNuevo(p, t.trim())));
    aplicados += r.aplicados;
    if (r.eliminado) eliminados++;
    insertados += nuevos.length;
    if (r.aplicados || nuevos.length) textos.set(c.p, [r.xml, ...nuevos].filter(Boolean).map((x) => textoParaIA(leerParrafo(x, 0, 0, false).texto)).filter(Boolean).join('\n'));
    xml = xml.slice(0, p.inicio) + r.xml + nuevos.join('') + xml.slice(p.fin);
  }
  zip.file('word/document.xml', xml);
  return { docx: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer, aplicados, noAplicados: noAplicados.reverse(), eliminados, insertados, textos, reubicados };
}

/**
 * Formato de la escritura generada sobre una plantilla: la plantilla ya trae el formato de la notaría
 * (es una escritura de la notaría), así que se conserva tal cual —renglones, títulos, carátula, líneas
 * de guiones— y solo se ponen el tamaño carta y los márgenes simétricos de la notaría. Los guiones de
 * los párrafos que cambiaron ya los recalculó aplicarCambios.
 */
export function formatoPagina(docx: Buffer): Buffer {
  const zip = new PizZip(docx);
  zip.file('word/document.xml', aplicarMargenes(documentoXml(docx)));
  const ajustes = zip.file('word/settings.xml');
  if (ajustes) zip.file('word/settings.xml', aplicarAjustesNotariales(ajustes.asText()));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

/**
 * Formato de impresión de la notaría sobre el documento completo (márgenes, Arial 12, interlineado 1,5,
 * justificado, sin renglones en blanco y guiones de relleno recalculados): formato-notarial.ts.
 * Rehace la carátula, los títulos y las líneas de guiones: es para un documento sin ese formato, no
 * para una plantilla que ya lo trae (para esa, formatoPagina).
 */
export function formatoNotaria(docx: Buffer): Buffer {
  const zip = new PizZip(docx);
  const xml = aplicarMargenes(documentoXml(docx));
  const inicio = xml.indexOf('<w:body>') + '<w:body>'.length;
  let finSeccion = xml.lastIndexOf('<w:sectPr');
  if (finSeccion < inicio) finSeccion = xml.lastIndexOf('</w:body>');
  zip.file('word/document.xml', xml.slice(0, inicio) + aplicarFormatoNotarial(xml.slice(inicio, finSeccion), anchoTextoDe(xml)) + xml.slice(finSeccion));
  const estilos = zip.file('word/styles.xml');
  if (estilos) zip.file('word/styles.xml', aplicarEstilosNotariales(estilos.asText()));
  const ajustes = zip.file('word/settings.xml');
  if (ajustes) zip.file('word/settings.xml', aplicarAjustesNotariales(ajustes.asText()));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

/** Datos marcados «FALTA: …» y [VERIFICAR: …] en un texto */
export const faltantesEn = (texto: string) => [...new Set([...normalizarMarcas(texto).matchAll(/«FALTA:\s*([^»]*)»/g)].map((m) => m[1].trim()).filter(Boolean))];
export const verificarEn = (texto: string) => [...new Set([...normalizarMarcas(texto).matchAll(/\[VERIFICAR:\s*([^\]]*)\]/g)].map((m) => m[1].trim()).filter(Boolean))];

/**
 * Convierte el .docx a PDF con un servicio Gotenberg (LibreOffice) externo, si PDF_CONVERSOR_URL está definida.
 * Devuelve null si no hay conversor configurado.
 */
export async function convertirAPdf(docx: Buffer, nombre = 'escritura.docx'): Promise<Buffer | null> {
  const url = process.env.PDF_CONVERSOR_URL;
  if (!url) return null;
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(docx)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), nombre);
  const r = await fetch(`${url.replace(/\/$/, '')}/forms/libreoffice/convert`, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`El conversor PDF respondió ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
