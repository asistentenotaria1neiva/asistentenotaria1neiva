/**
 * Conversión de números a letras en español (Colombia), con el estilo de la
 * Notaría Primera de Neiva: MAYÚSCULAS, sin tildes por defecto ("VEINTISEIS",
 * "UN MILLON") y "M/CTE" para los pesos.
 *
 * Los valores en letras SIEMPRE se generan desde el número: el usuario nunca
 * los digita (regla contra el error humano 6.2).
 */

export interface OpcionesLetras {
  /** Escribe tildes ortográficas (DIECISÉIS, MILLÓN). Por defecto false (estilo de la notaría). */
  tildes?: boolean;
  /** Apócope antes de sustantivo masculino: "VEINTIUN MIL", "UN PESOS" → "UN". Por defecto true. */
  apocope?: boolean;
}

const UNIDADES = ['CERO', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ',
  'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE',
  'VEINTIUNO', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

const CON_TILDE: Record<string, string> = {
  DIECISEIS: 'DIECISÉIS', VEINTIDOS: 'VEINTIDÓS', VEINTITRES: 'VEINTITRÉS', VEINTISEIS: 'VEINTISÉIS',
  VEINTIUN: 'VEINTIÚN', MILLON: 'MILLÓN',
};

/** 1..999 */
function centenas(n: number, apocope: boolean): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    let t: string;
    if (resto < 30) t = UNIDADES[resto];
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      t = DECENAS[d] + (u ? ' Y ' + UNIDADES[u] : '');
    }
    if (apocope) t = t.replace(/UNO$/, 'UN');
    partes.push(t);
  }
  return partes.join(' ');
}

function aplicarTildes(s: string, tildes: boolean): string {
  if (!tildes) return s;
  return s.replace(/\b(DIECISEIS|VEINTIDOS|VEINTITRES|VEINTISEIS|VEINTIUN|MILLON)\b/g, (m) => CON_TILDE[m]);
}

/**
 * Entero no negativo a letras (hasta 999.999.999.999).
 * Con apocope=true el resultado está listo para ir antes de un sustantivo masculino
 * ("VEINTIUN MIL PESOS"); con apocope=false termina en forma plena ("VEINTIUNO").
 */
export function enteroALetras(valor: number, opciones: OpcionesLetras = {}): string {
  const { tildes = false, apocope = true } = opciones;
  if (!Number.isInteger(valor) || valor < 0) throw new RangeError(`Valor no válido para convertir a letras: ${valor}`);
  if (valor > 999_999_999_999) throw new RangeError('Valor demasiado grande (máximo 999.999.999.999)');
  if (valor === 0) return 'CERO';

  const milesDeMillones = Math.floor(valor / 1_000_000_000);
  const millones = Math.floor((valor % 1_000_000_000) / 1_000_000);
  const miles = Math.floor((valor % 1_000_000) / 1000);
  const resto = valor % 1000;
  const partes: string[] = [];

  // Bloque de millones (incluye "mil millones")
  const totalMillones = milesDeMillones * 1000 + millones;
  if (totalMillones) {
    if (totalMillones === 1) partes.push('UN MILLON');
    else {
      const altos = milesDeMillones ? (milesDeMillones === 1 ? 'MIL' : centenas(milesDeMillones, true) + ' MIL') : '';
      const bajos = millones ? centenas(millones, true) : '';
      partes.push([altos, bajos].filter(Boolean).join(' ') + ' MILLONES');
    }
  }
  if (miles) partes.push(miles === 1 ? 'MIL' : centenas(miles, true) + ' MIL');
  if (resto) partes.push(centenas(resto, apocope));
  return aplicarTildes(partes.join(' '), tildes);
}

/** "$100.000.000" */
export function formatoPesos(valor: number): string {
  return '$' + formatoMiles(valor);
}

/** 1234567 → "1.234.567" */
export function formatoMiles(valor: number): string {
  if (!Number.isInteger(valor)) throw new RangeError('Se esperaba un entero');
  return valor.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Pesos en letras con el formato de las escrituras:
 *   100000000 → "CIEN MILLONES DE PESOS M/CTE ($100.000.000)"
 *   42200000  → "CUARENTA Y DOS MILLONES DOSCIENTOS MIL PESOS M/CTE ($42.200.000)"
 *   1000000   → "UN MILLON DE PESOS M/CTE ($1.000.000)"
 */
export function pesosEnLetras(valor: number, opciones: OpcionesLetras & { conNumero?: boolean } = {}): string {
  const { conNumero = true, ...op } = opciones;
  const letras = enteroALetras(valor, { ...op, apocope: true });
  // "DE PESOS" cuando la cifra termina exactamente en millones
  const de = valor >= 1_000_000 && valor % 1_000_000 === 0 ? 'DE ' : '';
  const unidad = valor === 1 ? 'PESO' : 'PESOS';
  return `${letras} ${de}${unidad} M/CTE` + (conNumero ? ` (${formatoPesos(valor)})` : '');
}

/** Parte decimal de dos cifras en letras: 0.5 → "CINCUENTA", 0.05 → "CERO CINCO" */
function decimalesEnLetras(centesimas: number, op: OpcionesLetras): string {
  if (centesimas < 10) return 'CERO ' + enteroALetras(centesimas, { ...op, apocope: false });
  return enteroALetras(centesimas, { ...op, apocope: false });
}

/**
 * Medida con decimales (áreas y longitudes):
 *   medidaEnLetras(97.5, 'METROS CUADRADOS', 'M2') → "NOVENTA Y SIETE PUNTO CINCUENTA METROS CUADRADOS (97.50 M2)"
 *   medidaEnLetras(6.5, 'metros', 'm', { minusculas: true }) → "seis punto cincuenta metros (6.50 m)"
 */
export function medidaEnLetras(valor: number, unidadLarga: string, unidadCorta: string,
  opciones: OpcionesLetras & { minusculas?: boolean } = {}): string {
  if (!(valor >= 0) || !Number.isFinite(valor)) throw new RangeError(`Medida no válida: ${valor}`);
  const { minusculas = false, ...op } = opciones;
  const centesimasTotales = Math.round(valor * 100);
  const entero = Math.floor(centesimasTotales / 100);
  const cent = centesimasTotales % 100;
  // Antes de "METROS" el número va con apócope ("VEINTIUN METROS"); "UN METRO" en singular
  let letras = enteroALetras(entero, { ...op, apocope: true });
  if (cent) letras += ' PUNTO ' + decimalesEnLetras(cent, op);
  const unidad = entero === 1 && cent === 0 ? unidadLarga.replace(/S\b/g, '').replace(/s\b/g, '') : unidadLarga;
  const numero = (centesimasTotales / 100).toFixed(2);
  const texto = `${letras} ${minusculas ? unidad.toLowerCase() : unidad.toUpperCase()}`;
  return `${minusculas ? texto.toLowerCase() : texto} (${numero} ${unidadCorta})`;
}

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/** Fecha a partir de "AAAA-MM-DD" sin desfases de zona horaria */
function partesFecha(fecha: string | Date): { d: number; m: number; a: number } {
  if (fecha instanceof Date) return { d: fecha.getDate(), m: fecha.getMonth() + 1, a: fecha.getFullYear() };
  const r = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!r) throw new RangeError(`Fecha no válida (se espera AAAA-MM-DD): ${fecha}`);
  const [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  const prueba = new Date(Date.UTC(a, m - 1, d));
  if (prueba.getUTCMonth() !== m - 1 || prueba.getUTCDate() !== d) throw new RangeError(`Fecha inexistente: ${fecha}`);
  return { d, m, a };
}

const dos = (n: number) => String(n).padStart(2, '0');

/** "CUATRO (04) DE AGOSTO DE DOS MIL VEINTISEIS (2026)"; el día 1 se escribe "PRIMERO (01)" */
export function fechaEnLetras(fecha: string | Date, op: OpcionesLetras = {}): string {
  const { d, m, a } = partesFecha(fecha);
  const dia = d === 1 ? 'PRIMERO' : enteroALetras(d, { ...op, apocope: false });
  return `${dia} (${dos(d)}) DE ${MESES[m - 1]} DE ${enteroALetras(a, { ...op, apocope: false })} (${a})`;
}

/** Fórmula de comparecencia: "a los CUATRO (04) DÍAS del mes de AGOSTO del año DOS MIL VEINTISEIS (2026)" */
export function fechaComparecencia(fecha: string | Date, op: OpcionesLetras = {}): string {
  const { d, m, a } = partesFecha(fecha);
  const anio = `del año ${enteroALetras(a, { ...op, apocope: false })} (${a})`;
  if (d === 1) return `al PRIMER (01) DÍA del mes de ${MESES[m - 1]} ${anio}`;
  return `a los ${enteroALetras(d, { ...op, apocope: true })} (${dos(d)}) DÍAS del mes de ${MESES[m - 1]} ${anio}`;
}

/** Fecha corta usada en el cuerpo: "07 de FEBRERO de 2024" */
export function fechaCorta(fecha: string | Date): string {
  const { d, m, a } = partesFecha(fecha);
  return `${dos(d)} de ${MESES[m - 1]} de ${a}`;
}

/** Número de escritura: "DOS MIL SEISCIENTOS DIECISEIS (2.616)" */
export function numeroEscrituraEnLetras(n: number, op: OpcionesLetras & { separadorMiles?: boolean } = {}): string {
  const { separadorMiles = true, ...resto } = op;
  return `${enteroALetras(n, { ...resto, apocope: false })} (${separadorMiles ? formatoMiles(n) : String(n)})`;
}

/** Porcentaje con letras: 12.5 → "DOCE PUNTO CINCO POR CIENTO (12.5%)" */
export function porcentajeEnLetras(valor: number, op: OpcionesLetras = {}): string {
  const [ent, dec] = String(valor).split('.');
  let letras = enteroALetras(Number(ent), { ...op, apocope: false });
  if (dec) {
    letras += ' PUNTO ' + (dec.length === 1
      ? enteroALetras(Number(dec), { ...op, apocope: false })
      : decimalesEnLetras(Number(dec.slice(0, 2)), op));
  }
  return `${letras} POR CIENTO (${valor}%)`;
}
