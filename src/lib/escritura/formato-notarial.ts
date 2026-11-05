/**
 * Formato de impresión de las escrituras de la notaría, aplicado al Word ya generado (sobre
 * cualquier plantilla aprobada, sin cambiarla).
 *
 * Resolución 9146 de 2012 de la Superintendencia de Notariado y Registro (papel de seguridad
 * notarial para la extensión de escrituras públicas, tamaño carta 21,59 × 27,94 cm):
 *   - cara frontal: margen superior 3 cm, izquierdo 3 cm, derecho 2 cm, inferior 0,9 cm;
 *   - cara posterior: superior 3 cm, izquierdo 2 cm, derecho 3 cm, inferior 0,9 cm
 *     (márgenes simétricos: las páginas impares son la cara frontal y las pares la posterior);
 *   - fuente Arial 12 en todo el texto, interlineado 1,5 (mínimo 32 renglones por cara);
 *   - texto con justificado completo (los títulos centrados se completan con guiones a ambos lados);
 *   - sin renglones en blanco entre los párrafos (solo el espacio para firmar, en la zona de firmas).
 *
 * Además, de las minutas de la notaría (p. ej. «448 - CASA HABITACION - SOLTERO»):
 *   - el renglón final de cada párrafo se completa con guiones ESCRITOS («… del Huila. ------»),
 *     no con una tabulación de relleno: Google Docs y otros visores no muestran ese relleno, y en
 *     el protocolo los espacios en blanco deben quedar llenos;
 *   - una línea de guiones antes de cada cláusula;
 *   - negrilla en los títulos de cláusula, los nombres, los datos en mayúsculas y las cifras;
 *   - en la carátula, los números de documento y los valores alineados a la derecha.
 *
 * Los guiones se calculan con el ancho de los caracteres de Arial (el de Helvetica, el mismo de
 * Liberation Sans en LibreOffice) y un margen de seguridad, para que no pasen al renglón siguiente.
 */

/**
 * Márgenes de la cara frontal según la Resolución 9146 de 2012 (twips; 1 cm = 567 twips).
 * Con márgenes simétricos, Word toma `izq` como margen interior y `der` como exterior: en la cara
 * posterior (páginas pares) quedan izquierdo 2 cm y derecho 3 cm, como exige la resolución.
 */
export const MARGENES_NOTARIA = { sup: 1701, der: 1134, inf: 510, izq: 1701 };

/** Tamaño carta reglamentario (twips): 21,59 × 27,94 cm */
export const PAGINA_CARTA = { ancho: 12240, alto: 15840 };

/** Interlineado 1,5 (en 240avos de renglón) */
const INTERLINEADO = 360;
const ESPACIADO = `<w:spacing w:before="0" w:after="0" w:line="${INTERLINEADO}" w:lineRule="auto"/>`;
const FUENTE = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>';
/** Arial 12 (en medios puntos) */
const TAMANO = '<w:sz w:val="24"/><w:szCs w:val="24"/>';

// Anchos de Helvetica / Arial en milésimas de em (de la tabla AFM): ' ' a '~'
const ANCHOS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const ANCHOS_NEGRILLA = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
const GUION = 333;
/**
 * Guiones escritos de menos al final de cada párrafo: el cálculo es aproximado y un guion de más
 * bajaría de renglón. Lo que falta hasta el margen lo completa la tabulación derecha con relleno
 * de guiones (Word la dibuja exacta; un visor que no la muestre deja solo ese pequeño tramo).
 */
const HOLGURA = 2;
/**
 * Una palabra que cabe en el renglón por menos de esto (milésimas de em, ≈ 2,4 pt) puede quedar en
 * él o bajar al siguiente según el programa que muestre el documento: se calculan los guiones de
 * ambas formas y se escriben los que caben en las dos.
 */
const AMBIGUO = 200;

function anchoCaracter(c: string, negrilla: boolean): number {
  const base = c.normalize('NFD')[0] ?? c;
  const i = base.charCodeAt(0) - 32;
  const tabla = negrilla ? ANCHOS_NEGRILLA : ANCHOS;
  if (i >= 0 && i < tabla.length) return tabla[i];
  return c === '°' ? 400 : c === 'º' ? 365 : 556;
}

/** Ancho de un texto en milésimas de em */
const ancho = (t: string, negrilla: boolean) => [...t].reduce((s, c) => s + anchoCaracter(c, negrilla), 0);

interface Segmento { texto: string; negrilla: boolean }

/**
 * Ancho (milésimas de em) que ocupa el último renglón de un texto, partiendo los renglones como
 * Word: en los espacios y después de los guiones. `primero` es el ancho del primer renglón.
 */
export function anchoUltimoRenglon(segmentos: Segmento[], anchoRenglon: number, primero = anchoRenglon): number {
  // Palabras con su ancho; un salto de línea reinicia el renglón
  let usado = 0, limite = primero, espacioPendiente = 0;
  const partir = (palabra: string, negrilla: boolean) => {
    const w = ancho(palabra, negrilla);
    if (usado > 0 && usado + espacioPendiente + w > limite) { usado = 0; limite = anchoRenglon; espacioPendiente = 0; }
    usado += espacioPendiente + w;
    espacioPendiente = 0;
  };
  for (const s of segmentos) {
    for (const pieza of s.texto.split(/(\n| +)/)) {
      if (!pieza) continue;
      if (pieza === '\n') { usado = 0; limite = anchoRenglon; espacioPendiente = 0; continue; }
      if (/^ +$/.test(pieza)) { espacioPendiente += ancho(pieza, s.negrilla); continue; }
      // Word también parte después de un guion («200-301776»)
      for (const p of pieza.split(/(?<=-)/)) partir(p, s.negrilla);
    }
  }
  return usado;
}

/** Guiones que caben después del texto para completar su último renglón */
export function guionesDeRelleno(segmentos: Segmento[], anchoRenglon: number, primero = anchoRenglon): number {
  const caben = (usado: number) => Math.floor((anchoRenglon - usado - ancho(' ', false)) / GUION) - HOLGURA;
  const holgado = caben(anchoUltimoRenglon(segmentos, anchoRenglon, primero));
  const justo = caben(anchoUltimoRenglon(segmentos, anchoRenglon - AMBIGUO, primero - AMBIGUO));
  return Math.max(0, Math.min(holgado, justo));
}

// ------------------------------------------------------------------ negrillas

const ORDINAL = '(?:(?:D[EÉ]CIMO|VIG[EÉ]SIMO) )?(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[EÉ]PTIMO|OCTAVO|NOVENO|D[EÉ]CIMO|VIG[EÉ]SIMO)';
/** «PRIMERO:», «SEGUNDO. TRADICIÓN:», «OCTAVO. CONSTANCIA (REDAM):», «PARAGRAFO:», «PARÁGRAFO PRIMERO.» */
const TITULO_CLAUSULA = new RegExp(`^(?:${ORDINAL}|PAR[AÁ]GRAFO(?: ${ORDINAL}| [IVX]+| \\d+)?)(?:\\s*[.:]\\s*[A-ZÁÉÍÓÚÑ(][A-ZÁÉÍÓÚÑ() ]*:|\\s*[.:])`);
/** Párrafos que empiezan una parte de la escritura: van precedidos de una línea de guiones */
const INICIO_PARTE = new RegExp(`^(?:${TITULO_CLAUSULA.source.slice(1)}|Compareci[oó] |Presente, |Se le agregan |DATOS PERSONALES|ADVERTENCIA|OTORGAMIENTO Y AUTORIZACI|En la ciudad de )`);
/** Rótulos fijos que la notaría escribe en negrilla */
const ROTULOS = /^(?:[a-z]\. |Se le agregan los comprobantes fiscales correspondientes cuyo texto es el del siguiente tenor:|C\.C\. No\.|Estado Civil:|Dirección y Domicilio:|Teléfono:|Actividad Económica:|E-mail:)/;

const MINUSCULA = /[a-záéíóúñü]/;
const cifraFuerte = (t: string) => /^\(?\$?\d{1,3}(?:\.\d{3})+(?:,\d+)?\)?[.,;:)]*$/.test(t) || /^\d{2,4}-\d{3,}[.,;:]*$/.test(t) || /^\d{10,}[.,;:]*$/.test(t);

/**
 * Tramos [inicio, fin) del texto que van en negrilla: el título de la cláusula, los rótulos y las
 * secuencias de palabras en MAYÚSCULAS (nombres, estado civil, valores en letras, direcciones) con
 * las cifras que las acompañan. Una palabra suelta de una o dos letras («(H)», «SI») no basta.
 */
export function tramosNegrilla(texto: string): [number, number][] {
  const tramos: [number, number][] = [];
  const titulo = TITULO_CLAUSULA.exec(texto) ?? ROTULOS.exec(texto);
  if (titulo) tramos.push([0, titulo[0].trimEnd().length]);
  const palabras = [...texto.matchAll(/\S+/g)];
  let i = 0;
  while (i < palabras.length) {
    // Un guion suelto une las partes de una dirección («SUR 01 - URBANIZACION»)
    const esMayus = (t: string) => !MINUSCULA.test(t) && !/^_+$/.test(t) && (/[A-ZÁÉÍÓÚÑÜ0-9$#&]/.test(t) || /^[-–]$/.test(t));
    if (!esMayus(palabras[i][0])) { i++; continue; }
    let j = i;
    while (j + 1 < palabras.length && esMayus(palabras[j + 1][0])) j++;
    const grupo = palabras.slice(i, j + 1).map((m) => m[0]);
    if (grupo.length > 25) {
      // Un texto largo transcrito en mayúsculas (los linderos del certificado): solo los costados
      for (const p of palabras.slice(i, j + 1)) if (/^(NORTE|SUR|ORIENTE|OCCIDENTE|NORORIENTE|NOROCCIDENTE|SURORIENTE|SUROCCIDENTE|CENIT|NADIR):/.test(p[0])) tramos.push([p.index!, p.index! + p[0].indexOf(':') + 1]);
    } else if (grupo.some((t) => (t.match(/[A-ZÁÉÍÓÚÑÜ]/g) ?? []).length >= 3 || cifraFuerte(t))) {
      const inicio = palabras[i].index!;
      let fin = palabras[j].index! + palabras[j][0].length;
      while (fin > inicio && /[,;\s–-]/.test(texto[fin - 1]) && !/\d/.test(texto[fin - 2] ?? '')) fin--;
      tramos.push([inicio, fin]);
    }
    i = j + 1;
  }
  // La marca «FALTA: …» de un dato sin valor no se parte (la vista previa la resalta entera)
  const marcas = [...texto.matchAll(/«FALTA:[^»]*»/g)].map((x) => [x.index!, x.index! + x[0].length]);
  // Los que se cruzan (el título de la cláusula y el grupo en mayúsculas que lo contiene) se unen
  const unidos = tramos.sort((x, y) => x[0] - y[0]).reduce<[number, number][]>((acc, t) => {
    const u = acc.at(-1);
    if (u && t[0] <= u[1]) u[1] = Math.max(u[1], t[1]); else acc.push([...t]);
    return acc;
  }, []);
  return unidos.flatMap(([a, b]) => marcas.reduce<[number, number][]>((acc, [ma, mb]) => acc.flatMap(([x, y]) => (mb <= x || ma >= y ? [[x, y]] : [...(x < ma ? [[x, ma]] as [number, number][] : []), ...(y > mb ? [[mb, y]] as [number, number][] : [])])), [[a, b]]));
}

// ------------------------------------------------------------------ XML

const decodificar = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const codificar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface Run { xml: string; rPr: string; texto: string | null; tab: boolean }

/** Partes de un párrafo: los runs de texto simple (w:t y w:br) se pueden reescribir; los demás se conservan */
function leerRuns(contenido: string): Run[] {
  const partes: Run[] = [];
  const re = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>|<w:r(?:\s[^>]*)?\/>|<(?!w:r[\s>/])[^>]+\/>|<(w:[a-zA-Z]+)(?:\s[^>]*)?>[\s\S]*?<\/\2>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(contenido))) {
    const xml = m[0];
    if (!xml.startsWith('<w:r') || /^<w:r[a-zA-Z]/.test(xml)) { partes.push({ xml, rPr: '', texto: null, tab: false }); continue; }
    const interior = m[1] ?? '';
    const rPr = /^<w:rPr>[\s\S]*?<\/w:rPr>/.exec(interior)?.[0] ?? '';
    const resto = interior.slice(rPr.length);
    if (/^<w:tab\/>$/.test(resto)) { partes.push({ xml, rPr, texto: null, tab: true }); continue; }
    if (/^(?:<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:t\/>|<w:br\/>)+$/.test(resto)) {
      const texto = resto.replace(/<w:br\/>/g, '\n').replace(/<w:t\/>/g, '').replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, (_, t) => decodificar(t));
      partes.push({ xml, rPr, texto, tab: false });
      continue;
    }
    partes.push({ xml, rPr, texto: null, tab: false });
  }
  return partes;
}

const esNegrilla = (rPr: string) => /<w:b(?:\s+w:val="(?:1|true|on)")?\s*\/>/.test(rPr);

function conNegrilla(rPr: string, negrilla: boolean): string {
  if (!negrilla || esNegrilla(rPr)) return rPr;
  const interior = rPr.replace(/^<w:rPr>|<\/w:rPr>$/g, '').replace(/<w:bCs?(?:\s[^>]*)?\/>/g, '');
  // En el orden del esquema la negrilla va después del estilo y la fuente
  const m = /^(?:<w:rStyle[^>]*\/>)?(?:<w:rFonts[^>]*\/>)?/.exec(interior)![0];
  return `<w:rPr>${m}<w:b/><w:bCs/>${interior.slice(m.length)}</w:rPr>`;
}

/** Un run con el texto; los saltos de línea («\n») y las tabulaciones («\t») van como w:br y w:tab */
const runTexto = (rPr: string, texto: string) => texto.split(/(\n|\t)/).map((t) => (t === '\n' ? '<w:br/>' : t === '\t' ? '<w:tab/>' : t ? `<w:t xml:space="preserve">${codificar(t)}</w:t>` : '')).join('').replace(/^/, `<w:r>${rPr}`) + '</w:r>';

/** Tras los guiones escritos, una tabulación que completa el renglón hasta el margen (ver tabRelleno) */
const FIN_RELLENO = '\t';

/** El rPr de un run sin negrilla, subrayado ni cursiva: para los guiones */
const rPrNeutro = (rPr: string) => {
  const r = rPr.replace(/<w:(?:b|bCs|i|iCs|u)(?:\s[^>]*)?\/>/g, '');
  return r === '<w:rPr></w:rPr>' ? '' : r;
};

// ------------------------------------------------------------------ Resolución 9146: fuente, interlineado, justificado

interface Hijo { nombre: string; xml: string }

/** Elementos hijos directos del interior de un elemento XML (con cualquier prefijo: w:, w14:, mc:…) */
function hijos(interior: string): Hijo[] {
  const re = /<([a-zA-Z][\w.-]*:[\w.-]+)\b[^>]*?\/>|<([a-zA-Z][\w.-]*:[\w.-]+)\b[^>]*>[\s\S]*?<\/\2>/g;
  return [...interior.matchAll(re)].map((m) => ({ nombre: m[1] ?? m[2], xml: m[0] }));
}

/**
 * Pone `nuevo` en lugar de los hijos `nombres`, antes del primer hijo que el esquema de Word
 * ubica después (Word rechaza el archivo si los hijos van fuera de orden).
 */
function ponerHijo(interior: string, nombres: string[], nuevo: string, siguientes: ReadonlySet<string>): string {
  const lista = hijos(interior).filter((h) => !nombres.includes(h.nombre));
  const i = lista.findIndex((h) => siguientes.has(h.nombre));
  lista.splice(i < 0 ? lista.length : i, 0, { nombre: '', xml: nuevo });
  return lista.map((h) => h.xml).join('');
}

// Orden de los hijos de w:rPr y w:pPr (ECMA-376): lo que va después de la fuente, del tamaño, del espaciado y de la alineación
const TRAS_TAMANO = ['w:highlight', 'w:u', 'w:effect', 'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout', 'w:specVanish', 'w:oMath', 'w:rPrChange'];
const TRAS_FUENTE = new Set(['w:b', 'w:bCs', 'w:i', 'w:iCs', 'w:caps', 'w:smallCaps', 'w:strike', 'w:dstrike', 'w:outline', 'w:shadow', 'w:emboss', 'w:imprint', 'w:noProof', 'w:snapToGrid', 'w:vanish', 'w:webHidden', 'w:color', 'w:spacing', 'w:w', 'w:kern', 'w:position', 'w:sz', 'w:szCs', ...TRAS_TAMANO]);
const TRAS_TAMANO_SET = new Set(TRAS_TAMANO);
const TRAS_ALINEACION = ['w:textDirection', 'w:textAlignment', 'w:textboxTightWrap', 'w:outlineLvl', 'w:divId', 'w:cnfStyle', 'w:rPr', 'w:sectPr', 'w:pPrChange'];
const TRAS_ALINEACION_SET = new Set(TRAS_ALINEACION);
const TRAS_ESPACIADO = new Set(['w:ind', 'w:contextualSpacing', 'w:mirrorIndents', 'w:suppressOverlap', 'w:jc', ...TRAS_ALINEACION]);

/** Interior de un w:rPr con Arial 12 (conserva negrilla, subrayado, etc.) */
function rPrArial(interior: string): string {
  return ponerHijo(ponerHijo(interior, ['w:rFonts'], FUENTE, TRAS_FUENTE), ['w:sz', 'w:szCs'], TAMANO, TRAS_TAMANO_SET);
}

const RPR = /<w:rPr>([\s\S]*?)<\/w:rPr>|<w:rPr\/>/g;

/**
 * Un párrafo con el formato de la resolución: interlineado 1,5 sin espacio antes ni después,
 * alineación `jc` (justificado completo, salvo lo que se conserva centrado en la zona de firmas)
 * y todo su texto en Arial 12.
 */
export function normalizarParrafo(p: string, jc: 'both' | 'center' = 'both'): string {
  const m = /^<w:p(\s[^>]*)?>(<w:pPr>[\s\S]*?<\/w:pPr>|<w:pPr\/>)?([\s\S]*)<\/w:p>$/.exec(p);
  if (!m) return p;
  let pPr = (m[2] ?? '').replace(/^<w:pPr\/>$/, '').replace(/^<w:pPr>|<\/w:pPr>$/g, '');
  pPr = ponerHijo(pPr, ['w:spacing'], ESPACIADO, TRAS_ESPACIADO);
  pPr = ponerHijo(pPr, ['w:jc'], `<w:jc w:val="${jc}"/>`, TRAS_ALINEACION_SET);
  pPr = pPr.replace(RPR, (_x, i: string | undefined) => `<w:rPr>${rPrArial(i ?? '')}</w:rPr>`);
  const contenido = m[3].replace(/(<w:r(?:\s[^>]*)?>)(?:<w:rPr>([\s\S]*?)<\/w:rPr>|<w:rPr\/>)?/g, (_x, abre: string, i: string | undefined) => `${abre}<w:rPr>${rPrArial(i ?? '')}</w:rPr>`);
  return `<w:p${m[1] ?? ''}><w:pPr>${pPr}</w:pPr>${contenido}</w:p>`;
}

/** Estilos del documento: toda propiedad de texto (y la predeterminada) en Arial 12 */
export function aplicarEstilosNotariales(estilos: string): string {
  let x = estilos.replace(RPR, (_m, i: string | undefined) => `<w:rPr>${rPrArial(i ?? '')}</w:rPr>`);
  const predeterminado = `<w:rPrDefault><w:rPr>${FUENTE}${TAMANO}</w:rPr></w:rPrDefault>`;
  if (/<w:rPrDefault\/>/.test(x)) x = x.replace(/<w:rPrDefault\/>/, predeterminado);
  else if (!/<w:rPrDefault>/.test(x)) {
    if (/<w:docDefaults>/.test(x)) x = x.replace(/<w:docDefaults>/, `<w:docDefaults>${predeterminado}`);
    else if (/<w:docDefaults\/>/.test(x)) x = x.replace(/<w:docDefaults\/>/, `<w:docDefaults>${predeterminado}</w:docDefaults>`);
    else x = x.replace(/<w:styles\b[^>]*>/, (a) => `${a}<w:docDefaults>${predeterminado}</w:docDefaults>`);
  }
  return x;
}

// Hijos de w:settings que el esquema pone antes de w:mirrorMargins
const ANTES_DE_ESPEJO = new Set(['w:writeProtection', 'w:view', 'w:zoom', 'w:removePersonalInformation', 'w:removeDateAndTime', 'w:doNotDisplayPageBoundaries', 'w:displayBackgroundShape', 'w:printPostScriptOverText', 'w:printFractionalCharacterWidth', 'w:printFormsData', 'w:embedTrueTypeFonts', 'w:embedSystemFonts', 'w:saveSubsetFonts', 'w:saveFormsData']);

/**
 * Márgenes simétricos (cara frontal en las páginas impares, posterior en las pares): la resolución
 * fija márgenes distintos para cada cara del papel notarial.
 */
export function aplicarAjustesNotariales(ajustes: string): string {
  const m = /^([\s\S]*?<w:settings\b[^>]*>)([\s\S]*)(<\/w:settings>[\s\S]*)$/.exec(ajustes);
  if (!m) return ajustes;
  const lista = hijos(m[2]).filter((h) => h.nombre !== 'w:mirrorMargins');
  let pos = 0;
  lista.forEach((h, i) => { if (ANTES_DE_ESPEJO.has(h.nombre)) pos = i + 1; });
  lista.splice(pos, 0, { nombre: 'w:mirrorMargins', xml: '<w:mirrorMargins/>' });
  return m[1] + lista.map((h) => h.xml).join('') + m[3];
}

/** Ancho (milésimas de em) de unos segmentos en un solo renglón */
const anchoSegmentos = (segmentos: Segmento[]) => segmentos.reduce((s, x) => s + ancho(x.texto, x.negrilla), 0);

/**
 * Guiones a la izquierda y a la derecha de un título que iba centrado, para que el renglón quede
 * completo y justificado. null si el título no cabe en un solo renglón.
 */
export function guionesCentrado(segmentos: Segmento[], renglon: number): [number, number] | null {
  if (segmentos.some((s) => s.texto.includes('\n'))) return null;
  const libre = renglon - anchoSegmentos(segmentos) - 2 * ancho(' ', false);
  const n = Math.floor(libre / GUION) - HOLGURA;
  const izq = Math.floor(n / 2);
  return izq >= 1 ? [izq, n - izq] : null;
}

// Hijos de w:pPr que el esquema pone después de w:tabs
const TRAS_TABS = new Set(['w:suppressAutoHyphens', 'w:kinsoku', 'w:wordWrap', 'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE', 'w:autoSpaceDN', 'w:bidi', 'w:adjustRightInd', 'w:snapToGrid', 'w:spacing', ...TRAS_ESPACIADO]);

/**
 * pPr con una tabulación derecha en el margen (`pos`, twips) con relleno de guiones: completa
 * exactamente el renglón después de los guiones escritos, sin depender del cálculo de anchos.
 */
export function tabRelleno(pPr: string, pos: number): string {
  const tab = `<w:tab w:val="right" w:leader="hyphen" w:pos="${pos}"/>`;
  const interior = pPr.replace(/^<w:pPr\/>$/, '').replace(/^<w:pPr>|<\/w:pPr>$/g, '');
  const nuevo = /<w:tabs>/.test(interior)
    ? interior.replace(/<\/w:tabs>/, `${tab}</w:tabs>`)
    : ponerHijo(interior, [], `<w:tabs>${tab}</w:tabs>`, TRAS_TABS);
  return `<w:pPr>${nuevo}</w:pPr>`;
}

/** Renglón de firma («______») */
const esLineaFirma = (t: string) => /^_{8,}/.test(t);

/** Un párrafo vacío que se puede quitar (no lleva salto de página, sección, imagen ni campo) */
const vacioRemovible = (p: string) => !/<w:br\b[^>]*w:type="page"|<w:sectPr|<w:drawing|<w:pict|<w:object|<w:fldChar|<w:fldSimple|<mc:AlternateContent/.test(p);

const twips = (pPr: string, atributo: string) => Number(new RegExp(`<w:ind\\b[^>]*\\bw:${atributo}="(-?\\d+)"`).exec(pPr)?.[1] ?? 0);

/**
 * Inserta los guiones de relleno antes de cada salto de línea, según el ancho de lo escrito en ese
 * tramo (con sus negrillas, calculadas sobre el texto sin guiones).
 */
function rellenarSaltos(partes: Run[], renglon: number, renglonPrimero: number): Run[] {
  const texto = partes.map((r) => (r.texto ?? (r.tab ? '\t' : '￼'))).join('');
  const tramos = tramosNegrilla(texto);
  const negrilla = (i: number) => tramos.some(([a, b]) => i >= a && i < b);
  // Guiones que van antes de cada salto (índice global del salto → texto a insertar)
  const inserciones = new Map<number, string>();
  let inicio = 0, primero = true;
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] !== '\n') continue;
    const segmentos: Segmento[] = [];
    for (let k = inicio; k < i;) {
      const b = negrilla(k);
      let f = k + 1;
      while (f < i && negrilla(f) === b) f++;
      segmentos.push({ texto: texto.slice(k, f), negrilla: b });
      k = f;
    }
    const n = guionesDeRelleno(segmentos, renglon, primero ? renglonPrimero : renglon);
    if (n > 0 && texto.slice(inicio, i).trim()) inserciones.set(i, `${/\s$/.test(texto.slice(inicio, i)) ? '' : ' '}${'-'.repeat(n)}${FIN_RELLENO}`);
    inicio = i + 1;
    primero = false;
  }
  let pos = 0;
  return partes.map((r) => {
    const largo = r.texto?.length ?? 1;
    if (r.texto === null) { pos += 1; return r; }
    let t = '';
    for (let k = 0; k < r.texto.length; k++) t += (inserciones.get(pos + k) ?? '') + r.texto[k];
    pos += largo;
    return { ...r, texto: t };
  });
}

/**
 * Párrafo de pura línea de guiones, a todo el ancho. Aquí el ancho es exacto (no hay texto que
 * estimar): sin holgura, los que caben enteros, para que el renglón quede lleno.
 */
const lineaGuiones = (anchoTwips: number) => {
  const n = Math.floor((anchoTwips / 20) * 1000 / 12 / GUION);
  return normalizarParrafo(`<w:p><w:pPr></w:pPr><w:r><w:t>${'-'.repeat(n)}</w:t></w:r></w:p>`);
};

/** Texto plano de un párrafo, para decidir */
const textoDe = (p: string) => decodificar(p.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, ''));
const soloGuiones = (t: string) => /^\s*-{3,}\s*$/.test(t);

/**
 * Formatea el cuerpo del documento. `anchoTexto`: ancho del renglón en twips (página menos márgenes).
 */
export function aplicarFormatoNotarial(cuerpo: string, anchoTexto: number): string {
  const enCaratula = { personas: false, especificacion: false };
  const salida: string[] = [];
  // Todo párrafo sale con Arial 12, interlineado 1,5 y justificado completo (Resolución 9146 de 2012)
  const parrafo = (xml: string, jc: 'both' | 'center' = 'both') => salida.push(normalizarParrafo(xml, jc));
  const renglonTexto = anchoTexto / 20 * 1000 / 12;
  let previo = '';
  // Desde el primer renglón de firma (firmas y anexos) se conserva el espacio para firmar
  let zonaFirmas = false;
  // Los párrafos dentro de una tabla tienen el ancho de su celda: no se completan con guiones
  let enTabla = 0;
  const parrafos = cuerpo.split(/(?=<w:p[\s>])|(?<=<\/w:p>)/);
  const planos = parrafos.map((t) => (/^<w:p[\s>]/.test(t) ? textoDe(t).trim() : null));
  for (const [indice, trozo] of parrafos.entries()) {
    if (!/^<w:p[\s>]/.test(trozo)) {
      enTabla += (trozo.match(/<w:tbl[\s>]/g) ?? []).length - (trozo.match(/<\/w:tbl>/g) ?? []).length;
      salida.push(trozo);
      continue;
    }
    const m = /^<w:p(\s[^>]*)?>([\s\S]*)<\/w:p>$/.exec(trozo);
    if (!m) { salida.push(trozo); continue; }
    let pPr = /^<w:pPr>[\s\S]*?<\/w:pPr>/.exec(m[2])?.[0] ?? '';
    const runs = leerRuns(m[2].slice(pPr.length));
    const texto = textoDe(m[2].slice(pPr.length)).replace(/\t$/, '');
    const plano = texto.trim();
    if (esLineaFirma(plano)) zonaFirmas = true;
    const centrado = /<w:jc w:val="center"\/>/.test(pPr);

    // Las líneas de guiones existentes se rehacen al ancho exacto (en una plantilla de un caso real quedaron al de otros datos)
    if (soloGuiones(plano)) { salida.push(lineaGuiones(anchoTexto)); previo = '-'; continue; }
    if (!plano) {
      // Sin renglones en blanco entre los párrafos; sí el espacio sobre el renglón de firma
      const siguiente = planos.slice(indice + 1).find((t) => t);
      const antesDeFirma = !!siguiente && esLineaFirma(siguiente);
      if (zonaFirmas || antesDeFirma || !vacioRemovible(trozo)) parrafo(trozo, zonaFirmas && centrado ? 'center' : 'both');
      continue;
    }

    // Carátula: nombre y documento, acto y valor, con el número a la derecha
    // Número y fecha en blanco: el renglón se completa con guiones (sin renglón en blanco) para escribirlos en la terminación
    if (/^(ESCRITURA P[UÚ]BLICA N[UÚ]MERO|FECHA DE OTORGAMIENTO):$/.test(plano)) {
      const rPr = conNegrilla(rPrNeutro(runs.find((r) => r.texto)?.rPr ?? ''), true);
      const n = guionesDeRelleno([{ texto: plano, negrilla: true }], renglonTexto);
      parrafo(`<w:p${m[1] ?? ''}>${n > 0 ? tabRelleno('', anchoTexto) : '<w:pPr></w:pPr>'}${runTexto(rPr, plano)}${n > 0 ? runTexto(rPrNeutro(rPr), ` ${'-'.repeat(n)}${FIN_RELLENO}`) : ''}</w:p>`);
      previo = plano;
      continue;
    }
    if (/^PERSONAS QUE INTERVIENEN EN EL ACTO$/.test(plano)) {
      enCaratula.personas = true;
      if (previo !== '-') salida.push(lineaGuiones(anchoTexto));
      // Título centrado con guiones a ambos lados: el renglón queda justificado y completo
      const g = guionesCentrado([{ texto: plano, negrilla: true }], renglonTexto);
      const titulo = runTexto('<w:rPr><w:b/><w:bCs/><w:u w:val="single"/></w:rPr>', plano);
      parrafo(`<w:p${m[1] ?? ''}>${g ? `${tabRelleno('', anchoTexto)}${runTexto('', `${'-'.repeat(g[0])} `)}${titulo}${runTexto('', ` ${'-'.repeat(g[1])}${FIN_RELLENO}`)}` : `<w:pPr></w:pPr>${titulo}`}</w:p>`);
      previo = plano;
      continue;
    }
    if (/^CODIGO DE LA NOTARIA/.test(plano)) enCaratula.personas = false;
    if (/^ESPECIFICACI[OÓ]N\s+VALOR DEL ACTO$/.test(plano)) {
      enCaratula.especificacion = true;
      const tabs = `<w:pPr><w:tabs><w:tab w:val="right" w:pos="${anchoTexto}"/></w:tabs><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>`;
      const rPr = '<w:rPr><w:b/><w:bCs/><w:u w:val="single"/></w:rPr>';
      parrafo(`<w:p${m[1] ?? ''}>${tabs}${runTexto(rPr, 'ESPECIFICACION')}<w:r><w:tab/></w:r>${runTexto(rPr, 'VALOR DEL ACTO')}</w:p>`);
      previo = plano;
      continue;
    }
    const valor = enCaratula.personas ? /^(.+?)\s+(\d[\d.]*(?:-\d)?)$/.exec(plano) : enCaratula.especificacion ? /^(.+?)\s+(\$[\d.]+|SIN CUANT[IÍ]A)$/.exec(plano) : null;
    if (valor && runs.every((r) => r.texto !== null || r.tab)) {
      const tabs = `<w:pPr><w:tabs><w:tab w:val="right" w:pos="${anchoTexto}"/></w:tabs><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>`;
      const rPr = conNegrilla(rPrNeutro(runs.find((r) => r.texto)?.rPr ?? ''), true);
      parrafo(`<w:p${m[1] ?? ''}>${tabs}${runTexto(rPr, valor[1])}<w:r><w:tab/></w:r>${runTexto(rPr, valor[2])}</w:p>`);
      previo = plano;
      continue;
    }
    if (enCaratula.especificacion) {
      // Terminada la especificación, una línea de guiones antes de los inmuebles
      enCaratula.especificacion = false;
      salida.push(lineaGuiones(anchoTexto));
      previo = '-';
    }

    // Línea de guiones antes de cada parte de la escritura (si no la tiene ya)
    if (INICIO_PARTE.test(plano) && previo && previo !== '-') salida.push(lineaGuiones(anchoTexto));

    // Relleno: el de la tabulación con guía de guiones, el de guiones escritos al final o, en el
    // cuerpo de la escritura, el de todo párrafo (en el protocolo no quedan espacios en blanco).
    // No se rellenan: la zona de firmas, las celdas de tabla, el encabezado de las firmas
    // («LOS OTORGANTES,», que termina en coma o va justo antes del renglón de firma) ni los
    // párrafos con tabulaciones, imágenes o campos (su ancho no se puede calcular)
    const conGuia = /w:leader="hyphen"/.test(pPr);
    const ultimoTexto = [...runs].reverse().find((r) => r.texto !== null && r.texto.trim());
    const terminaEnGuiones = !!ultimoTexto && /\s-{3,}\s*$/.test(ultimoTexto.texto!);
    const siguiente = planos.slice(indice + 1).find((t) => t);
    const calculable = runs.every((r) => r.texto !== null || /^<w:(?:bookmarkStart|bookmarkEnd|proofErr|lastRenderedPageBreak)\b/.test(r.xml)) && !/<w:(?:drawing|pict|object|fldChar|fldSimple)\b/.test(trozo);
    const automatico = !zonaFirmas && !enTabla && calculable && !/,$/.test(plano) && !(siguiente && esLineaFirma(siguiente));
    const rellenar = conGuia || terminaEnGuiones || automatico;
    if (conGuia) pPr = pPr.replace(/<w:tabs>[\s\S]*?<\/w:tabs>/, (t) => t.replace(/<w:tab\b[^>]*w:leader="hyphen"[^>]*\/>/g, '')).replace(/<w:tabs><\/w:tabs>/, '');
    let partes = runs;
    if (conGuia) {
      // Se quita la tabulación final que dibujaba el relleno
      const ultimo = partes.map((r) => r.tab).lastIndexOf(true);
      if (ultimo >= 0 && partes.slice(ultimo + 1).every((r) => r.texto === null && !r.tab)) partes = partes.filter((_, i) => i !== ultimo);
    }
    if (terminaEnGuiones) partes = partes.map((r) => (r === ultimoTexto ? { ...r, texto: r.texto!.replace(/\s-{3,}\s*$/, '') } : r));

    const renglon = (anchoTexto - twips(pPr, 'left') - twips(pPr, 'right')) / 20 * 1000 / 12;
    const renglonPrimero = renglon - twips(pPr, 'firstLine') / 20 * 1000 / 12;
    // Cada renglón cortado con un salto de línea (los linderos, uno por línea) también se completa con guiones
    if (rellenar && partes.some((r) => r.texto?.includes('\n'))) partes = rellenarSaltos(partes, renglon, renglonPrimero);

    // Negrillas sobre el texto de los runs simples
    const textoRuns = partes.map((r) => (r.texto ?? (r.tab ? '\t' : '￼'))).join('');
    const tramos = tramosNegrilla(textoRuns);
    const enTramo = (i: number) => tramos.some(([a, b]) => i >= a && i < b);
    let pos = 0;
    const segmentos: Segmento[] = [];
    const nuevos = partes.map((r) => {
      if (r.texto === null) { pos += 1; return r.xml; }
      let xml = '';
      let k = 0;
      while (k < r.texto.length) {
        const negrilla = enTramo(pos + k) || esNegrilla(r.rPr);
        let fin = k + 1;
        while (fin < r.texto.length && (enTramo(pos + fin) || esNegrilla(r.rPr)) === negrilla) fin++;
        const t = r.texto.slice(k, fin);
        xml += runTexto(conNegrilla(r.rPr, negrilla), t);
        segmentos.push({ texto: t, negrilla });
        k = fin;
      }
      pos += r.texto.length;
      return xml;
    });

    const rPrGuiones = rPrNeutro(ultimoTexto?.rPr ?? '');
    // Un título centrado (fuera de la zona de firmas) queda justificado, con guiones a ambos lados
    const centro = centrado && !zonaFirmas ? guionesCentrado(segmentos, renglonPrimero) : null;
    // Margen derecho del párrafo, desde el margen izquierdo de la página (twips)
    const margen = anchoTexto - twips(pPr, 'right');
    let conTab = partes.some((r) => r.texto?.includes(FIN_RELLENO));
    if (centro) {
      const primerTexto = partes.find((r) => r.texto !== null && r.texto.trim());
      nuevos.unshift(runTexto(rPrNeutro(primerTexto?.rPr ?? ''), `${'-'.repeat(centro[0])} `));
      nuevos.push(runTexto(rPrGuiones, ` ${'-'.repeat(centro[1])}${FIN_RELLENO}`));
      conTab = true;
    } else if (rellenar) {
      const n = guionesDeRelleno(segmentos, renglon, renglonPrimero);
      if (n > 0) { nuevos.push(runTexto(rPrGuiones, ` ${'-'.repeat(n)}${FIN_RELLENO}`)); conTab = true; }
    }
    if (conTab) pPr = tabRelleno(pPr, margen);
    parrafo(`<w:p${m[1] ?? ''}>${pPr}${nuevos.join('')}</w:p>`, centrado && zonaFirmas ? 'center' : 'both');
    previo = plano;
  }
  return salida.join('');
}

/**
 * Pone en la sección del documento el tamaño carta y los márgenes de la Resolución 9146 de 2012
 * (con w:mirrorMargins en los ajustes, ver aplicarAjustesNotariales).
 */
export function aplicarMargenes(xml: string): string {
  const atributo = (pg: string, nombre: string, valor: number) =>
    new RegExp(`w:${nombre}="-?\\d+"`).test(pg) ? pg.replace(new RegExp(`w:${nombre}="-?\\d+"`), `w:${nombre}="${valor}"`) : pg.replace(/\s*\/>$/, ` w:${nombre}="${valor}"/>`);
  return xml
    .replace(/<w:pgSz\b[^>]*\/>/g, `<w:pgSz w:w="${PAGINA_CARTA.ancho}" w:h="${PAGINA_CARTA.alto}" w:code="1"/>`)
    .replace(/<w:pgMar\b[^>]*\/>/g, (pg) => [
      ['top', MARGENES_NOTARIA.sup], ['right', MARGENES_NOTARIA.der], ['bottom', MARGENES_NOTARIA.inf], ['left', MARGENES_NOTARIA.izq], ['gutter', 0],
    ].reduce((x, [n, v]) => atributo(x, n as string, v as number), pg));
}

/** Ancho del renglón (twips): carta menos los márgenes (el mismo en ambas caras) */
export function anchoTextoDe(_xml?: string): number {
  return PAGINA_CARTA.ancho - MARGENES_NOTARIA.izq - MARGENES_NOTARIA.der;
}
