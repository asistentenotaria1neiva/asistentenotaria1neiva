/**
 * Formato de impresión de las escrituras de la notaría, aplicado al Word ya generado (sobre
 * cualquier plantilla aprobada, sin cambiarla). Tomado de las minutas de la notaría (p. ej.
 * «448 - CASA HABITACION - SOLTERO»):
 *   - márgenes sup. 3,0 cm / der. 2,2 cm / inf. 0,9 cm / izq. 3,1 cm, Arial 12, interlineado 1,5;
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

/** Márgenes de la minuta 448 (twips) */
export const MARGENES_NOTARIA = { sup: 1701, der: 1247, inf: 510, izq: 1758 };

// Anchos de Helvetica / Arial en milésimas de em (de la tabla AFM): ' ' a '~'
const ANCHOS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const ANCHOS_NEGRILLA = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
const GUION = 333;
/** Guiones de menos al final de cada párrafo: el cálculo es aproximado y un guion de más bajaría de renglón */
const HOLGURA = 3;

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
  const restante = anchoRenglon - anchoUltimoRenglon(segmentos, anchoRenglon, primero) - ancho(' ', false);
  return Math.max(0, Math.floor(restante / GUION) - HOLGURA);
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

const runTexto = (rPr: string, texto: string) => texto.split('\n').map((t, i) => `${i ? '<w:br/>' : ''}${t ? `<w:t xml:space="preserve">${codificar(t)}</w:t>` : ''}`).join('').replace(/^/, `<w:r>${rPr}`) + '</w:r>';

/** El rPr de un run sin negrilla, subrayado ni cursiva: para los guiones */
const rPrNeutro = (rPr: string) => {
  const r = rPr.replace(/<w:(?:b|bCs|i|iCs|u)(?:\s[^>]*)?\/>/g, '');
  return r === '<w:rPr></w:rPr>' ? '' : r;
};

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
    if (n > 0 && texto.slice(inicio, i).trim()) inserciones.set(i, `${/\s$/.test(texto.slice(inicio, i)) ? '' : ' '}${'-'.repeat(n)}`);
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
  return `<w:p><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:t>${'-'.repeat(n)}</w:t></w:r></w:p>`;
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
  let previo = '';
  const parrafos = cuerpo.split(/(?=<w:p[\s>])|(?<=<\/w:p>)/);
  for (const trozo of parrafos) {
    if (!/^<w:p[\s>]/.test(trozo)) { salida.push(trozo); continue; }
    const m = /^<w:p(\s[^>]*)?>([\s\S]*)<\/w:p>$/.exec(trozo);
    if (!m) { salida.push(trozo); continue; }
    let pPr = /^<w:pPr>[\s\S]*?<\/w:pPr>/.exec(m[2])?.[0] ?? '';
    const runs = leerRuns(m[2].slice(pPr.length));
    const texto = textoDe(m[2].slice(pPr.length)).replace(/\t$/, '');
    const plano = texto.trim();

    // Las líneas de guiones existentes se rehacen al ancho exacto (en una plantilla de un caso real quedaron al de otros datos)
    if (soloGuiones(plano)) { salida.push(lineaGuiones(anchoTexto)); previo = '-'; continue; }
    if (!plano) { salida.push(trozo); continue; }

    // Carátula: nombre y documento, acto y valor, con el número a la derecha
    // Número y fecha en blanco: sin relleno, con un renglón libre para escribirlos en la terminación
    if (/^(ESCRITURA P[UÚ]BLICA N[UÚ]MERO|FECHA DE OTORGAMIENTO):$/.test(plano)) {
      const rPr = conNegrilla(rPrNeutro(runs.find((r) => r.texto)?.rPr ?? ''), true);
      salida.push(`<w:p${m[1] ?? ''}><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>${runTexto(rPr, plano)}</w:p><w:p><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:p>`);
      previo = plano;
      continue;
    }
    if (/^PERSONAS QUE INTERVIENEN EN EL ACTO$/.test(plano)) {
      enCaratula.personas = true;
      if (previo !== '-') salida.push(lineaGuiones(anchoTexto));
      salida.push(`<w:p${m[1] ?? ''}><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>${runTexto('<w:rPr><w:b/><w:bCs/><w:u w:val="single"/></w:rPr>', plano)}</w:p>`);
      previo = plano;
      continue;
    }
    if (/^CODIGO DE LA NOTARIA/.test(plano)) enCaratula.personas = false;
    if (/^ESPECIFICACI[OÓ]N\s+VALOR DEL ACTO$/.test(plano)) {
      enCaratula.especificacion = true;
      const tabs = `<w:pPr><w:tabs><w:tab w:val="right" w:pos="${anchoTexto}"/></w:tabs><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>`;
      const rPr = '<w:rPr><w:b/><w:bCs/><w:u w:val="single"/></w:rPr>';
      salida.push(`<w:p${m[1] ?? ''}>${tabs}${runTexto(rPr, 'ESPECIFICACION')}<w:r><w:tab/></w:r>${runTexto(rPr, 'VALOR DEL ACTO')}</w:p>`);
      previo = plano;
      continue;
    }
    const valor = enCaratula.personas ? /^(.+?)\s+(\d[\d.]*(?:-\d)?)$/.exec(plano) : enCaratula.especificacion ? /^(.+?)\s+(\$[\d.]+|SIN CUANT[IÍ]A)$/.exec(plano) : null;
    if (valor && runs.every((r) => r.texto !== null || r.tab)) {
      const tabs = `<w:pPr><w:tabs><w:tab w:val="right" w:pos="${anchoTexto}"/></w:tabs><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>`;
      const rPr = conNegrilla(rPrNeutro(runs.find((r) => r.texto)?.rPr ?? ''), true);
      salida.push(`<w:p${m[1] ?? ''}>${tabs}${runTexto(rPr, valor[1])}<w:r><w:tab/></w:r>${runTexto(rPr, valor[2])}</w:p>`);
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

    // Relleno: el de la tabulación con guía de guiones o el de guiones escritos al final
    const conGuia = /w:leader="hyphen"/.test(pPr);
    const ultimoTexto = [...runs].reverse().find((r) => r.texto !== null && r.texto.trim());
    const terminaEnGuiones = !!ultimoTexto && /\s-{3,}\s*$/.test(ultimoTexto.texto!);
    const rellenar = conGuia || terminaEnGuiones;
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

    if (rellenar) {
      const n = guionesDeRelleno(segmentos, renglon, renglonPrimero);
      const rPr = rPrNeutro(ultimoTexto?.rPr ?? '');
      if (n > 0) nuevos.push(runTexto(rPr, ` ${'-'.repeat(n)}`));
    }
    salida.push(`<w:p${m[1] ?? ''}>${pPr}${nuevos.join('')}</w:p>`);
    previo = plano;
  }
  return salida.join('');
}

/** Pone los márgenes de la notaría en la sección del documento */
export function aplicarMargenes(xml: string): string {
  return xml.replace(/<w:pgMar\b[^>]*\/>/g, (pg) => pg
    .replace(/w:top="-?\d+"/, `w:top="${MARGENES_NOTARIA.sup}"`)
    .replace(/w:right="-?\d+"/, `w:right="${MARGENES_NOTARIA.der}"`)
    .replace(/w:bottom="-?\d+"/, `w:bottom="${MARGENES_NOTARIA.inf}"`)
    .replace(/w:left="-?\d+"/, `w:left="${MARGENES_NOTARIA.izq}"`));
}

/** Ancho del renglón (twips) según la página del documento */
export function anchoTextoDe(xml: string): number {
  const ancho = Number(/<w:pgSz\b[^>]*w:w="(\d+)"/.exec(xml)?.[1] ?? 12240);
  return ancho - MARGENES_NOTARIA.izq - MARGENES_NOTARIA.der;
}
