/**
 * Validación de los pasos del formulario (obligatoriedad y formato), compartida entre
 * el navegador (para no dejar avanzar) y el servidor (que vuelve a validar todo).
 */
import type { Campo, Paso } from './esquemas';
import { VALIDADORES, validarDocumento } from '../validaciones/formatos';

export type Errores = Record<string, string>;

/** Lee un valor por ruta con puntos ("tradicion.escritura_fecha") */
export function leerRuta(obj: unknown, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

export function escribirRuta(obj: Record<string, unknown>, ruta: string, valor: unknown): void {
  const partes = ruta.split('.');
  let actual = obj;
  for (const k of partes.slice(0, -1)) {
    if (!actual[k] || typeof actual[k] !== 'object') actual[k] = {};
    actual = actual[k] as Record<string, unknown>;
  }
  actual[partes[partes.length - 1]] = valor;
}

const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);

export function campoVisible(c: Campo, valores: Record<string, unknown>): boolean {
  if (!c.visibleSi) return true;
  const actual = leerRuta(valores, c.visibleSi.campo);
  return c.visibleSi.valores.some((x) => x === actual || String(x) === String(actual));
}

/** Valida un conjunto de campos sobre un objeto de valores; prefijo para las rutas de error */
export function validarCampos(campos: Campo[], valores: Record<string, unknown>, prefijo = ''): Errores {
  const errores: Errores = {};
  for (const c of campos) {
    if (!campoVisible(c, valores)) continue;
    const v = leerRuta(valores, c.id);
    const ruta = prefijo + c.id;
    if (vacio(v)) {
      if (c.obligatorio) errores[ruta] = `${c.etiqueta}: dato obligatorio.`;
      continue;
    }
    if (c.tipo === 'lista' && c.subcampos && Array.isArray(v)) {
      v.forEach((item, i) => Object.assign(errores, validarCampos(c.subcampos!, item as Record<string, unknown>, `${ruta}.${i}.`)));
      continue;
    }
    if (c.validacion && typeof v !== 'boolean') {
      const r = (VALIDADORES[c.validacion] as (x: string) => { ok: boolean; error?: string })(String(v));
      if (!r.ok) errores[ruta] = `${c.etiqueta}: ${r.error}`;
    }
  }
  return errores;
}

/** Valida una persona: campos + documento según su tipo + coherencias básicas */
export function validarPersona(campos: Campo[], p: Record<string, unknown>, prefijo: string): Errores {
  const errores = validarCampos(campos, p, prefijo);
  if (!vacio(p.numero_documento) && !vacio(p.tipo_documento)) {
    const r = validarDocumento(String(p.tipo_documento), String(p.numero_documento));
    if (!r.ok) errores[`${prefijo}numero_documento`] = `Número de documento: ${r.error}`;
  }
  if (p.tipo_persona === 'JURIDICA' && vacio(p.representante_id)) errores[`${prefijo}representante_id`] = 'Indique la persona que comparece por la entidad.';
  if (p.apoderado_id && p.apoderado_id === p.id) errores[`${prefijo}apoderado_id`] = 'Una persona no puede ser su propio apoderado.';
  if (p.menor_de_edad && vacio(p.representante_legal_id) && p.tipo_documento !== 'NUIP' && p.tipo_documento !== 'TI') {
    errores[`${prefijo}tipo_documento`] = 'Un menor de edad se identifica con registro civil (NUIP) o tarjeta de identidad.';
  }
  return errores;
}

export function validarPaso(paso: Paso, valor: unknown): Errores {
  if (paso.id === 'personas' || paso.id === 'inmuebles') {
    const lista = Array.isArray(valor) ? (valor as Record<string, unknown>[]) : [];
    const errores: Errores = {};
    lista.forEach((item, i) => {
      Object.assign(errores, paso.id === 'personas'
        ? validarPersona(paso.campos, item, `${paso.id}.${i}.`)
        : validarCampos(paso.campos, item, `${paso.id}.${i}.`));
    });
    return errores;
  }
  return validarCampos(paso.campos, (valor ?? {}) as Record<string, unknown>, `${paso.id}.`);
}
