/**
 * Validaciones de formato (regla contra el error humano 6.2).
 * Cada validador devuelve { ok, normalizado?, error? } para que el formulario
 * muestre un mensaje claro y guarde el valor ya normalizado.
 */

export interface Resultado {
  ok: boolean;
  normalizado?: string;
  error?: string;
}

const soloDigitos = (s: string) => s.replace(/[.\s,]/g, '');
const miles = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Cédula de ciudadanía colombiana: solo dígitos, entre 3 y 10, sin cero inicial.
 * (La cédula no tiene dígito de verificación; el cruce con documentos lo hace la IA.)
 * Se normaliza con puntos de miles, como se escribe en las escrituras: 1.075.311.992
 */
export function validarCedula(valor: string): Resultado {
  const d = soloDigitos(valor ?? '');
  if (!d) return { ok: false, error: 'La cédula es obligatoria.' };
  if (!/^\d+$/.test(d)) return { ok: false, error: 'La cédula solo puede contener números.' };
  if (d.length < 3 || d.length > 10) return { ok: false, error: 'La cédula debe tener entre 3 y 10 dígitos.' };
  if (d.startsWith('0')) return { ok: false, error: 'La cédula no puede empezar por cero.' };
  return { ok: true, normalizado: miles(d) };
}

/** Razón social de una entidad (banco, sociedad, fondo…): su «cédula» con dígito de verificación es un NIT */
const ENTIDAD = /(^|[\s,.])(BANCO|BANCOLOMBIA|DAVIVIENDA|S\.?\s?A\.?(\s?S\.?)?|LTDA\.?|FONDO|CAJA|COOPERATIVA|FIDUCIARIA|CORPORACI[OÓ]N|FUNDACI[OÓ]N|ASOCIACI[OÓ]N|MUNICIPIO|DEPARTAMENTO|INSTITUTO|EMPRESA|COMPA[NÑ][IÍ]A|E\.?S\.?P\.?|FINANCIERA|LEASING)(?=$|[\s,.])/;
export const pareceEntidad = (nombre: unknown) => ENTIDAD.test(String(nombre ?? '').toUpperCase());

/**
 * Corrige sin preguntar un número de documento tal como lo leyó la IA o lo digitaron:
 * «C.C. No. 12.345.678 de Neiva», «12.345.678-», «CC#1075234567», una «O» o una «l» entre dígitos
 * (lectura del escáner). Devuelve el número válido y normalizado, o null si ni así es válido.
 * Con `esEntidad`, una «cédula» que es en realidad un NIT con su dígito de verificación correcto se devuelve como NIT.
 */
export function corregirNumeroDocumento(tipo: string, numero: unknown, esEntidad = false): { tipo: string; numero: string } | null {
  let t = String(numero ?? '').toUpperCase().trim();
  if (!t) return null;
  // Rótulos al comienzo y el lugar de expedición al final
  t = t.replace(/^(\s*(C\.?\s*C\.?|C[EÉ]DULA(\s+DE\s+CIUDADAN[IÍ]A)?|NIT\.?|NUIP\.?|T\.?\s*I\.?|N[OÚU°º]\.?|N[UÚ]MERO|#|:|-)\s*)+/, '');
  t = t.replace(/\s+(DE|EXP|EXPEDIDA|EN)\b.*$/, '');
  // Letras que el escáner confunde con dígitos, solo entre dígitos o junto a ellos
  t = t.replace(/(?<=\d)[OQ]|[OQ](?=\d)/g, '0').replace(/(?<=\d)[IL|!]|[IL|](?=\d)/g, '1').replace(/(?<=\d)S(?=\d)/g, '5').replace(/(?<=\d)B(?=\d)/g, '8');
  const nit = /^(\d[\d.\s]{5,18}\d)\s*-\s*(\d)$/.exec(t);
  if (tipo === 'NIT' || (tipo === 'CC' && nit && esEntidad)) {
    const r = validarNit(nit ? `${nit[1].replace(/\D/g, '')}-${nit[2]}` : t.replace(/[^\d-]/g, ''));
    if (r.ok) return { tipo: 'NIT', numero: r.normalizado! };
    if (tipo === 'NIT') return null;
  }
  // Una cédula con un guion y un dígito al final («12.345.678-9»): el guion y lo que sigue sobran
  const d = (tipo === 'CC' && nit ? nit[1] : t).replace(/\D/g, '');
  const validar = tipo === 'CC' ? validarCedula : tipo === 'NUIP' || tipo === 'TI' ? validarNuip : null;
  if (!validar || !d) return null;
  const r = validar(d);
  return r.ok ? { tipo, numero: r.normalizado! } : null;
}

/** NUIP / registro civil / tarjeta de identidad: 10 u 11 dígitos */
export function validarNuip(valor: string): Resultado {
  const d = soloDigitos(valor ?? '');
  if (!/^\d{10,11}$/.test(d)) return { ok: false, error: 'El NUIP debe tener 10 u 11 dígitos.' };
  return { ok: true, normalizado: miles(d) };
}

/** Dígito de verificación del NIT según el algoritmo de la DIAN (módulo 11 con pesos primos). */
export function digitoVerificacionNit(base: string): number {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const d = soloDigitos(base);
  let suma = 0;
  for (let i = 0; i < d.length; i++) suma += Number(d[d.length - 1 - i]) * pesos[i];
  const r = suma % 11;
  return r > 1 ? 11 - r : r;
}

/** NIT: 9 dígitos + dígito de verificación ("860.002.964-4"). Verifica el DV. */
export function validarNit(valor: string): Resultado {
  const limpio = (valor ?? '').replace(/[.\s]/g, '');
  const m = /^(\d{6,15})-?(\d)$/.exec(limpio);
  if (!m) return { ok: false, error: 'El NIT debe tener el formato 860.002.964-4 (número y dígito de verificación).' };
  const [, base, dv] = m;
  const esperado = digitoVerificacionNit(base);
  if (esperado !== Number(dv)) return { ok: false, error: `El dígito de verificación no corresponde: para ${miles(base)} debe ser ${esperado}.` };
  return { ok: true, normalizado: `${miles(base)}-${dv}` };
}

/**
 * Matrícula inmobiliaria: código del círculo registral + guion + número.
 * Ejemplos: 200-3626 (Neiva), 204-6785 (La Plata), 50C-1513366 (Bogotá Zona Centro).
 */
export function validarMatricula(valor: string): Resultado {
  const v = (valor ?? '').toUpperCase().replace(/\s/g, '');
  if (!/^\d{2,3}[A-Z]?-\d{1,8}$/.test(v)) return { ok: false, error: 'La matrícula debe tener el formato 200-12345 (círculo - número).' };
  return { ok: true, normalizado: v };
}

/**
 * Cédula catastral / número predial: solo dígitos, con 15, 20, 25 o 30 posiciones
 * (formatos encontrados en las escrituras de la notaría). Otra longitud suele ser un dígito omitido.
 */
export function validarCedulaCatastral(valor: string): Resultado {
  const d = (valor ?? '').replace(/[\s.-]/g, '');
  if (!/^\d+$/.test(d)) return { ok: false, error: 'La cédula catastral solo puede contener números.' };
  if (![15, 20, 25, 30].includes(d.length)) {
    return { ok: false, error: `La cédula catastral tiene ${d.length} dígitos; se esperan 15, 20, 25 o 30. Revise si falta o sobra un dígito.` };
  }
  return { ok: true, normalizado: d };
}

/** Fecha AAAA-MM-DD existente; opcionalmente no futura */
export function validarFecha(valor: string, opciones: { noFutura?: boolean; hoy?: Date } = {}): Resultado {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor ?? '');
  if (!m) return { ok: false, error: 'Fecha no válida (use el selector de fecha).' };
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(a, mes - 1, d));
  if (f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return { ok: false, error: 'La fecha no existe.' };
  if (a < 1900) return { ok: false, error: 'El año no es válido.' };
  const hoy = opciones.hoy ?? new Date();
  if (opciones.noFutura && f.getTime() > Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) {
    return { ok: false, error: 'La fecha no puede ser futura.' };
  }
  return { ok: true, normalizado: valor };
}

/** Valor en pesos: entero positivo (acepta "$100.000.000" o "100000000") */
export function validarValor(valor: string | number, opciones: { permitirCero?: boolean } = {}): Resultado {
  const s = typeof valor === 'number' ? String(valor) : (valor ?? '').replace(/[$\s.]/g, '');
  if (!/^\d+$/.test(s)) return { ok: false, error: 'El valor debe ser un número entero en pesos, sin decimales.' };
  const n = Number(s);
  if (!opciones.permitirCero && n <= 0) return { ok: false, error: 'El valor debe ser mayor que cero.' };
  if (n > 999_999_999_999) return { ok: false, error: 'El valor es demasiado grande.' };
  return { ok: true, normalizado: String(n) };
}

/** Área o longitud: número positivo con hasta 4 decimales (punto o coma decimal) */
export function validarMedida(valor: string | number): Resultado {
  const s = typeof valor === 'number' ? String(valor) : (valor ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,4})?$/.test(s)) return { ok: false, error: 'Escriba la medida como número, p. ej. 97.50' };
  if (Number(s) <= 0) return { ok: false, error: 'La medida debe ser mayor que cero.' };
  return { ok: true, normalizado: s };
}

/** Porcentaje entre 0 (excluido) y 100 */
export function validarPorcentaje(valor: string | number): Resultado {
  const s = typeof valor === 'number' ? String(valor) : (valor ?? '').trim().replace(',', '.').replace('%', '');
  const n = Number(s);
  if (!/^\d+(\.\d{1,4})?$/.test(s) || n <= 0 || n > 100) return { ok: false, error: 'El porcentaje debe estar entre 0 y 100.' };
  return { ok: true, normalizado: s };
}

/** Nombre de persona: mayúsculas, sin dobles espacios, sin números */
export function validarNombre(valor: string): Resultado {
  const v = (valor ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (v.length < 3) return { ok: false, error: 'El nombre es obligatorio.' };
  if (/\d/.test(v)) return { ok: false, error: 'El nombre no puede contener números.' };
  if (v.split(' ').length < 2) return { ok: false, error: 'Escriba nombre y apellido completos.' };
  return { ok: true, normalizado: v };
}

/** Tarjeta profesional de abogado */
export function validarTarjetaProfesional(valor: string): Resultado {
  const d = soloDigitos(valor ?? '');
  if (!/^\d{3,7}$/.test(d)) return { ok: false, error: 'La tarjeta profesional debe tener entre 3 y 7 dígitos.' };
  return { ok: true, normalizado: d };
}

export const VALIDADORES = {
  cedula: validarCedula,
  nuip: validarNuip,
  nit: validarNit,
  matricula: validarMatricula,
  cedula_catastral: validarCedulaCatastral,
  fecha: (v: string) => validarFecha(v),
  fecha_pasada: (v: string) => validarFecha(v, { noFutura: true }),
  valor: (v: string) => validarValor(v),
  medida: validarMedida,
  porcentaje: validarPorcentaje,
  nombre: validarNombre,
  tarjeta_profesional: validarTarjetaProfesional,
} as const;

export type TipoValidacion = keyof typeof VALIDADORES;

/** Valida un documento según su tipo */
export function validarDocumento(tipo: string, numero: string): Resultado {
  switch (tipo) {
    case 'CC': return validarCedula(numero);
    case 'NUIP':
    case 'TI': return validarNuip(numero);
    case 'NIT': return validarNit(numero);
    case 'CE':
    case 'PASAPORTE': {
      const v = (numero ?? '').trim().toUpperCase();
      return /^[A-Z0-9]{4,15}$/.test(v.replace(/[.\s]/g, '')) ? { ok: true, normalizado: v } : { ok: false, error: 'Número de documento no válido.' };
    }
    default: return { ok: false, error: 'Tipo de documento desconocido.' };
  }
}
