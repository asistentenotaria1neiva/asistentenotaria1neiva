/**
 * Comparación de datos entre documentos y con lo digitado, sin distinguir diferencias de forma:
 * una cédula con o sin puntos, una matrícula con o sin ceros a la izquierda, un nombre con los
 * apellidos primero (como en el certificado de tradición), tildes, mayúsculas y espacios.
 */

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** «200-0012345», «200-12345» y «No. 200 12345» son la misma matrícula */
export function claveMatricula(v: unknown): string {
  return (String(v ?? '').match(/\d+/g) ?? []).map((n) => n.replace(/^0+(?=\d)/, '')).join('-');
}

/**
 * ¿Dos números prediales son el mismo predio? El certificado, el paz y salvo y la escritura los
 * escriben distinto: con o sin el código del municipio (41001), en el formato antiguo o en el nuevo
 * de 30 dígitos, con más o menos ceros de relleno («4100101060000037800130000000000» y
 * «010600000378001300000000»). Se comparan por la terminación, con y sin los ceros.
 */
export function mismaCatastral(a: unknown, b: unknown): boolean {
  const x = digitos(a), y = digitos(b);
  if (!x || !y) return false;
  if (x === y || (Math.min(x.length, y.length) >= 10 && (x.endsWith(y) || y.endsWith(x)))) return true;
  const sx = x.replace(/0/g, ''), sy = y.replace(/0/g, '');
  return Math.min(sx.length, sy.length) >= 6 && (sx.endsWith(sy) || sy.endsWith(sx));
}

const texto = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Campos que se comparan solo por sus dígitos */
const POR_DIGITOS = /(^|\.)(numero_documento|cedula_catastral|cedula_catastral_paz_salvo|escritura_numero|tarjeta_profesional)$/;

/** ¿Dos valores del mismo campo dicen lo mismo? `campo` es la ruta o el subcampo (p. ej. "numero_documento") */
export function mismoValor(campo: string, a: unknown, b: unknown): boolean {
  if (JSON.stringify(a) === JSON.stringify(b)) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (/(^|\.)(cedula_catastral|cedula_catastral_paz_salvo)$/.test(campo)) return mismaCatastral(a, b);
  if (POR_DIGITOS.test(campo)) return !!digitos(a) && digitos(a) === digitos(b);
  if (/(^|\.)matricula$/.test(campo)) return !!claveMatricula(a) && claveMatricula(a) === claveMatricula(b);
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  if (typeof a === 'string' && typeof b === 'string') {
    // Los nombres: las mismas palabras en cualquier orden
    if (/(^|\.)(nombre|tradente)$/.test(campo)) return texto(a).split(' ').sort().join(' ') === texto(b).split(' ').sort().join(' ');
    return texto(a) === texto(b);
  }
  return false;
}

/**
 * Cuando dos documentos no coinciden, el que manda para cada dato: la cédula para los datos de la
 * persona; el certificado de tradición para los linderos y lo registral; el título (escritura
 * anterior) para las áreas. Si el documento que manda trae el dato, se toma ese y no se pregunta;
 * si no lo trae (p. ej. el certificado remite a la escritura para los linderos), vale el otro.
 */
export function documentoQueManda(campo: string): string | null {
  if (/^persona:[^.]+\.(nombre|numero_documento|lugar_expedicion|genero)$/.test(campo)) return 'CEDULA';
  if (/^(inmueble|catastral):[^.]+\.(area_terreno|area_construida)$/.test(campo)) return 'ESCRITURA_ANTERIOR';
  if (/^(inmueble|catastral):[^.]+\.(linderos|matricula|cedula_catastral|direccion|municipio|fecha_certificado_tradicion|tradicion\..+)$/.test(campo)) return 'CERTIFICADO_TRADICION';
  return null;
}
