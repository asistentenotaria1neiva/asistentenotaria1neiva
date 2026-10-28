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

const texto = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Campos que se comparan solo por sus dígitos */
const POR_DIGITOS = /(^|\.)(numero_documento|cedula_catastral|cedula_catastral_paz_salvo|escritura_numero|tarjeta_profesional)$/;

/** ¿Dos valores del mismo campo dicen lo mismo? `campo` es la ruta o el subcampo (p. ej. "numero_documento") */
export function mismoValor(campo: string, a: unknown, b: unknown): boolean {
  if (JSON.stringify(a) === JSON.stringify(b)) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
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
 * persona; el título (escritura anterior) para linderos y áreas; el certificado para lo registral.
 * Si el documento que manda trae el dato, se toma ese y no se pregunta.
 */
export function documentoQueManda(campo: string): string | null {
  if (/^persona:[^.]+\.(nombre|numero_documento|lugar_expedicion|genero)$/.test(campo)) return 'CEDULA';
  if (/^(inmueble|catastral):[^.]+\.(linderos|area_terreno|area_construida)$/.test(campo)) return 'ESCRITURA_ANTERIOR';
  if (/^(inmueble|catastral):[^.]+\.(matricula|cedula_catastral|direccion|municipio|fecha_certificado_tradicion|tradicion\..+)$/.test(campo)) return 'CERTIFICADO_TRADICION';
  return null;
}
