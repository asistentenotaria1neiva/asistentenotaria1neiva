/**
 * Rutas de campo que usan la IA y el asistente para referirse a un dato del formulario:
 *   escritura.<campo> | persona:<id>.<campo> | inmueble:<id>.<campo> | acto:<acto>.<campo>
 * Se validan siempre contra los esquemas: la IA no puede escribir en un campo que no existe
 * ni con un valor de otro tipo.
 */
import { PASOS_COMUNES, ESQUEMAS, CAMPOS_PERSONA, CAMPOS_INMUEBLE, type Campo } from './esquemas';
import { validarPaso, validarCampos, campoVisible, leerRuta } from './validar-formulario';
import type { DatosExpediente } from './tipos';

/** Campo del formulario al que apunta una ruta, con su ruta dentro de los datos */
export interface Destino { campo: Campo; rutaDatos: string; etiqueta: string; paso: 'escritura' | 'personas' | 'inmuebles' | { acto: string } }

/**
 * Datos que el asistente no pregunta: los completa el funcionario que hace la terminación de la
 * escritura (en el Word quedan en blanco, como en las minutas de la notaría).
 */
export const CAMPOS_TERMINACION = ['numero', 'fecha_otorgamiento', 'hojas', 'derechos', 'retefuente', 'libro_varios'];

/** Datos de los comparecientes que la plantilla omite si faltan; el asistente los pregunta aunque no sean obligatorios */
export const RECOMENDADOS_PERSONA = ['estado_civil', 'actividad_economica', 'lugar_expedicion'];

const camposActo = (acto: string) => ESQUEMAS[acto]?.pasos.flatMap((p) => p.campos) ?? [];

export function resolverRuta(datos: DatosExpediente, actos: string[], ruta: string): Destino | null {
  const m = /^(escritura|persona:([^.]+)|inmueble:([^.]+)|acto:([^.]+))\.([a-z_]+(?:\.[a-z_]+)?)$/.exec(ruta);
  if (!m) return null;
  const [, , personaId, inmuebleId, acto, id] = m;
  if (m[1] === 'escritura') {
    const campo = PASOS_COMUNES[0].campos.find((c) => c.id === id);
    return campo ? { campo, rutaDatos: `escritura.${id}`, etiqueta: `Escritura · ${campo.etiqueta}`, paso: 'escritura' } : null;
  }
  if (personaId) {
    const i = datos.personas.findIndex((p) => p.id === personaId);
    const campo = CAMPOS_PERSONA.find((c) => c.id === id);
    return i >= 0 && campo ? { campo, rutaDatos: `personas.${i}.${id}`, etiqueta: `${datos.personas[i].nombre || 'Persona'} · ${campo.etiqueta}`, paso: 'personas' } : null;
  }
  if (inmuebleId) {
    const i = datos.inmuebles.findIndex((x) => x.id === inmuebleId);
    const campo = CAMPOS_INMUEBLE.find((c) => c.id === id);
    return i >= 0 && campo ? { campo, rutaDatos: `inmuebles.${i}.${id}`, etiqueta: `${datos.inmuebles[i].matricula || datos.inmuebles[i].nombre_corto || 'Inmueble'} · ${campo.etiqueta}`, paso: 'inmuebles' } : null;
  }
  if (!actos.includes(acto)) return null;
  const campo = camposActo(acto).find((c) => c.id === id);
  return campo ? { campo, rutaDatos: `actos.${acto}.${id}`, etiqueta: `${ESQUEMAS[acto].titulo} · ${campo.etiqueta}`, paso: { acto } } : null;
}

/** Comprueba que el valor propuesto tenga el tipo del campo; devuelve el valor normalizado o un error */
export function validarValor(campo: Campo, valor: unknown, datos: DatosExpediente): { valor: unknown } | { error: string } {
  const esPersona = (x: unknown) => typeof x === 'string' && datos.personas.some((p) => p.id === x);
  const esInmueble = (x: unknown) => typeof x === 'string' && datos.inmuebles.some((i) => i.id === x);
  switch (campo.tipo) {
    case 'texto': case 'textoLargo':
      return typeof valor === 'string' ? { valor: valor.trim() } : { error: 'se esperaba un texto' };
    case 'fecha':
      return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? { valor } : { error: 'se esperaba una fecha AAAA-MM-DD' };
    case 'entero': case 'moneda': case 'medida': {
      const n = typeof valor === 'number' ? valor : Number(String(valor).replace(/\s/g, ''));
      return Number.isFinite(n) ? { valor: n } : { error: 'se esperaba un número' };
    }
    case 'booleano':
      return typeof valor === 'boolean' ? { valor } : { error: 'se esperaba sí o no' };
    case 'opciones':
      return campo.opciones?.some((o) => o.valor === valor) ? { valor } : { error: 'no es una de las opciones del campo' };
    case 'persona':
      return esPersona(valor) ? { valor } : { error: 'no es una persona registrada' };
    case 'personas':
      return Array.isArray(valor) && valor.every(esPersona) ? { valor } : { error: 'no son personas registradas' };
    case 'inmueble':
      return esInmueble(valor) ? { valor } : { error: 'no es un inmueble registrado' };
    case 'inmuebles':
      return Array.isArray(valor) && valor.every(esInmueble) ? { valor } : { error: 'no son inmuebles registrados' };
    case 'lista':
      return Array.isArray(valor) && valor.every((x) => x && typeof x === 'object') ? { valor } : { error: 'se esperaba una lista' };
  }
}

/** Catálogo compacto de los campos modificables, para que la IA use rutas y valores válidos */
export function catalogo(actos: string[], { sinTerminacion = false } = {}) {
  const describir = (c: Campo) => ({ campo: c.id, etiqueta: c.etiqueta, tipo: c.tipo, ...(c.obligatorio ? { obligatorio: true } : {}), ...(c.ayuda ? { ayuda: c.ayuda } : {}), ...(c.opciones ? { opciones: c.opciones.map((o) => o.valor) } : {}) });
  return {
    escritura: PASOS_COMUNES[0].campos.filter((c) => !sinTerminacion || !CAMPOS_TERMINACION.includes(c.id)).map(describir),
    persona: CAMPOS_PERSONA.map(describir),
    inmueble: CAMPOS_INMUEBLE.map(describir),
    actos: Object.fromEntries(actos.filter((a) => ESQUEMAS[a]).map((a) => [a, camposActo(a).map(describir)])),
  };
}

/**
 * Convierte la respuesta de un formulario (texto o lista de valores marcados) al tipo del campo.
 * Devuelve undefined si la respuesta está vacía.
 */
export function convertirRespuesta(campo: Campo, crudo: string | string[] | undefined): unknown {
  if (Array.isArray(crudo)) return crudo.length ? crudo : undefined;
  const t = (crudo ?? '').trim();
  if (!t) return undefined;
  switch (campo.tipo) {
    case 'booleano': return t === 'true' ? true : t === 'false' ? false : t;
    case 'moneda': case 'entero': return Number(t.replace(/[^\d-]/g, ''));
    case 'medida': return Number(t.replace(/\s/g, '').replace(',', '.'));
    case 'personas': case 'inmuebles': return [t];
    default: return t;
  }
}

/** Convierte la ruta de un error de validación ("personas.0.genero") en la ruta de campo ("persona:<id>.genero") */
export function rutaDesdeError(datos: DatosExpediente, rutaError: string): string | null {
  if (/^escritura\.[a-z_]+$/.test(rutaError)) return rutaError;
  const m = /^(personas|inmuebles|actos)\.([^.]+)\.(.+)$/.exec(rutaError);
  if (!m) return null;
  const [, base, clave, resto] = m;
  if (base === 'actos') return `acto:${clave}.${resto}`;
  const lista = base === 'personas' ? datos.personas : datos.inmuebles;
  const elemento = lista[Number(clave)];
  return elemento ? `${base === 'personas' ? 'persona' : 'inmueble'}:${elemento.id}.${resto}` : null;
}

/**
 * Convierte el campo de una observación de las reglas ("personas.<id>.estado_civil",
 * "inmuebles.<id>.matricula", "actos.compraventa.precio") en la ruta de campo. Si ya es una ruta, la devuelve.
 */
export function rutaDesdeCampo(campo: string | null | undefined): string | null {
  if (!campo) return null;
  if (/^(escritura\.|persona:|inmueble:|acto:)/.test(campo)) return campo;
  const m = /^(personas|inmuebles|actos)\.([^.]+)\.(.+)$/.exec(campo);
  if (!m) return null;
  const [, base, clave, resto] = m;
  return `${base === 'personas' ? 'persona' : base === 'inmuebles' ? 'inmueble' : 'acto'}:${clave}.${resto}`;
}

export interface DatoFaltante { ruta: string; etiqueta: string; motivo: string; obligatorio: boolean }

/**
 * Datos que faltan para completar la escritura según los esquemas (sin IA): los obligatorios de
 * cada paso y los recomendados de los comparecientes. Los datos de la terminación no se cuentan.
 */
export function datosFaltantes(datos: DatosExpediente, actos: string[]): DatoFaltante[] {
  const errores: Record<string, string> = {
    ...validarPaso(PASOS_COMUNES[0], datos.escritura),
    ...validarPaso(PASOS_COMUNES[1], datos.personas),
    ...validarPaso(PASOS_COMUNES[2], datos.inmuebles),
  };
  for (const a of actos) {
    const valores = (datos.actos[a] ?? {}) as Record<string, unknown>;
    for (const p of ESQUEMAS[a]?.pasos ?? []) Object.assign(errores, validarCampos(p.campos, valores, `actos.${a}.`));
  }
  const faltantes: DatoFaltante[] = [];
  // Comparecientes e inmuebles que tienen un papel en algún acto
  const conRol = new Set<string>();
  for (const a of actos) for (const v of Object.values(datos.actos[a] ?? {})) for (const x of Array.isArray(v) ? v : [v]) if (typeof x === 'string') conRol.add(x);
  // Ya elegidos los inmuebles de la escritura, los demás del expediente no se preguntan (no van en ella)
  const hayInmueblesElegidos = datos.inmuebles.some((i) => conRol.has(i.id));
  const agregar = (ruta: string | null, motivo: string, obligatorio: boolean) => {
    if (!ruta || faltantes.some((f) => f.ruta === ruta)) return;
    const inmueble = /^inmueble:([^.]+)\./.exec(ruta)?.[1];
    if (inmueble && hayInmueblesElegidos && !conRol.has(inmueble)) return;
    const destino = resolverRuta(datos, actos, ruta);
    if (!destino || destino.campo.tipo === 'lista') return;
    if (destino.paso === 'escritura' && CAMPOS_TERMINACION.includes(destino.campo.id)) return;
    faltantes.push({ ruta, etiqueta: destino.etiqueta, motivo, obligatorio });
  };
  for (const [rutaError, mensaje] of Object.entries(errores)) agregar(rutaDesdeError(datos, rutaError), mensaje, true);

  // Comparecientes: personas naturales que tienen un papel en algún acto
  for (const p of datos.personas) {
    if (!conRol.has(p.id) || p.tipo_persona !== 'NATURAL' || p.menor_de_edad) continue;
    for (const id of RECOMENDADOS_PERSONA) {
      const campo = CAMPOS_PERSONA.find((c) => c.id === id)!;
      const v = leerRuta(p, id);
      if (campoVisible(campo, p as unknown as Record<string, unknown>) && (v === undefined || v === '')) agregar(`persona:${p.id}.${id}`, `${campo.etiqueta}: la escritura lo menciona.`, false);
    }
  }
  return faltantes;
}
