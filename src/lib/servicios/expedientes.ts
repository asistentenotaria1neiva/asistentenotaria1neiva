/**
 * Expedientes: creación, permisos, guardado del formulario por pasos, sugerencias de la IA
 * y flujo de estados (sección 4.3):
 *   BORRADOR → (enviar) EN_REVISION → (aprobar) APROBADA [lista para firma] → FIRMADA → ARCHIVADA
 *                                    ↘ (devolver) DEVUELTO → (enviar) EN_REVISION …
 */
import 'server-only';
import type { Expediente, Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { datosVacios, type DatosExpediente, type Persona, type Inmueble } from '../escritura/tipos';
import { PASOS_COMUNES, ESQUEMAS } from '../escritura/esquemas';
import { cargarActosDePlantillas } from './actos-plantilla';
import { validarPaso, validarCampos, leerRuta, escribirRuta, type Errores } from '../escritura/validar-formulario';
import { validarDocumento, validarMatricula, validarCedulaCatastral } from '../validaciones/formatos';
import { registrarCorreccion } from './aprendizaje';
import { notificar } from './notificaciones';
import { asegurarCatalogo } from './inicializacion';

export class ErrorNegocio extends Error {}

// ------------------------------------------------------------------ permisos

export function puedeVer(s: SesionActiva, e: Pick<Expediente, 'responsableId' | 'revisorId'>): boolean {
  return s.usuario.rol !== 'DIGITADOR' || e.responsableId === s.usuario.id;
}

export function puedeEditar(s: SesionActiva, e: Pick<Expediente, 'responsableId' | 'estado'>): boolean {
  if (!['BORRADOR', 'DEVUELTO'].includes(e.estado)) return false;
  return s.usuario.rol === 'ADMINISTRADOR' || e.responsableId === s.usuario.id;
}

export async function obtenerExpediente(s: SesionActiva, id: string) {
  await cargarActosDePlantillas();
  const e = await db.expediente.findUnique({ where: { id }, include: { tipo: true, responsable: { select: { nombreCompleto: true } }, revisor: { select: { nombreCompleto: true } } } });
  if (!e || !puedeVer(s, e)) throw new ErrorNegocio('Expediente no encontrado o sin permiso.');
  return e;
}

export const datosDe = (e: { datos: Prisma.JsonValue }): DatosExpediente => ({ ...datosVacios(), ...(e.datos as object) } as DatosExpediente);
export const actosDe = (e: { actos: Prisma.JsonValue }): string[] => (Array.isArray(e.actos) ? (e.actos as string[]) : []);

// ------------------------------------------------------------------ creación

function validarActos(actos: string[]): string[] {
  if (!actos.length) throw new ErrorNegocio('Seleccione al menos un acto con plantilla disponible.');
  if (actos.some((a) => !ESQUEMAS[a])) throw new ErrorNegocio('Hay actos sin plantilla disponible.');
  if (new Set(actos).size !== actos.length) throw new ErrorNegocio('Un acto no puede repetirse en la misma escritura.');
  return actos;
}

export async function crearExpediente(s: SesionActiva, actos: string[]): Promise<string> {
  await cargarActosDePlantillas();
  const validos = validarActos(actos);
  // Si el catálogo falta (p. ej. tras restaurar un respaldo) se recarga antes de crear
  if (!(await db.tipoEscritura.findUnique({ where: { id: validos[0] } }))) await asegurarCatalogo();
  const anio = new Date().getFullYear();
  const exp = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(515151)`;
    const n = await tx.expediente.count({ where: { numeroInterno: { startsWith: `EXP-${anio}-` } } });
    return tx.expediente.create({
      data: { numeroInterno: `EXP-${anio}-${String(n + 1).padStart(5, '0')}`, tipoId: validos[0], actos: validos, responsableId: s.usuario.id, datos: datosVacios() as unknown as Prisma.InputJsonValue },
    });
  });
  await auditar({ ...datosAuditoria(s), accion: 'EXPEDIENTE_CREADO', entidad: 'expediente', entidadId: exp.id, detalle: { numero: exp.numeroInterno, actos: validos } });
  return exp.id;
}

/** Cambia los actos de la escritura (si el asistente advierte que los documentos indican otro tipo). Los datos de los actos retirados se conservan. */
export async function cambiarActos(s: SesionActiva, id: string, actos: string[]) {
  const e = await obtenerExpediente(s, id);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('El expediente no se puede editar en su estado actual.');
  const validos = validarActos(actos);
  if (JSON.stringify(validos) === JSON.stringify(actosDe(e))) return;
  if (!(await db.tipoEscritura.findUnique({ where: { id: validos[0] } }))) await asegurarCatalogo();
  await db.expediente.update({ where: { id }, data: { actos: validos, tipoId: validos[0] } });
  await auditar({ ...datosAuditoria(s), accion: 'EXPEDIENTE_ACTOS_CAMBIADOS', entidad: 'expediente', entidadId: id, detalle: { de: actosDe(e), a: validos } });
}

// ------------------------------------------------------------------ normalización

const limpiar = (v: unknown): unknown => {
  if (typeof v === 'string') { const t = v.trim().replace(/\s+/g, ' '); return t === '' ? undefined : t; }
  if (Array.isArray(v)) return v.map(limpiar);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'linderos' || k === 'acuerdo' ? (typeof x === 'string' ? x.trim() : x) : limpiar(x)]).filter(([, x]) => x !== undefined));
  return v;
};

function normalizarPersona(p: Persona): Persona {
  const n = { ...p, nombre: p.nombre?.toUpperCase() };
  const r = n.tipo_documento && n.numero_documento ? validarDocumento(n.tipo_documento, n.numero_documento) : null;
  if (r?.ok && r.normalizado) n.numero_documento = r.normalizado;
  if (n.tipo_persona === 'JURIDICA') { delete n.genero; delete n.estado_civil; delete n.apoderado_id; }
  return n;
}

function normalizarInmueble(i: Inmueble): Inmueble {
  const n = { ...i };
  const m = n.matricula ? validarMatricula(n.matricula) : null;
  if (m?.ok) n.matricula = m.normalizado!;
  for (const k of ['cedula_catastral', 'cedula_catastral_paz_salvo'] as const) {
    const c = n[k] ? validarCedulaCatastral(n[k]!) : null;
    if (c?.ok) n[k] = c.normalizado!;
  }
  if (!n.ph_activo) delete n.ph;
  if (n.area_terreno !== undefined) n.area_terreno = Number(n.area_terreno);
  if (n.area_construida !== undefined) n.area_construida = Number(n.area_construida);
  if (n.paz_salvo?.avaluo !== undefined) n.paz_salvo.avaluo = Number(String(n.paz_salvo.avaluo).replace(/\D/g, ''));
  return n;
}

// ------------------------------------------------------------------ guardado por pasos

import type { ActualizacionPaso } from './tipos-acciones';
export type { ActualizacionPaso };

/**
 * Guarda un paso (aunque tenga errores, para no perder lo digitado) y devuelve los errores
 * de obligatoriedad/formato. El formulario no deja avanzar mientras haya errores.
 */
export async function guardarPaso(s: SesionActiva, id: string, act: ActualizacionPaso): Promise<{ errores: Errores }> {
  const e = await obtenerExpediente(s, id);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('El expediente no se puede editar en su estado actual.');
  const datos = datosDe(e);
  let errores: Errores;
  if (act.paso === 'escritura') {
    datos.escritura = limpiar(act.valor) as DatosExpediente['escritura'];
    if (datos.escritura.numero !== undefined) datos.escritura.numero = Number(datos.escritura.numero) || undefined;
    errores = validarPaso(PASOS_COMUNES[0], datos.escritura);
  } else if (act.paso === 'personas') {
    datos.personas = (limpiar(act.valor) as Persona[]).map(normalizarPersona);
    errores = validarPaso(PASOS_COMUNES[1], datos.personas);
  } else if (act.paso === 'inmuebles') {
    datos.inmuebles = (limpiar(act.valor) as Inmueble[]).map(normalizarInmueble);
    errores = validarPaso(PASOS_COMUNES[2], datos.inmuebles);
  } else {
    const esq = ESQUEMAS[act.acto];
    if (!esq || !actosDe(e).includes(act.acto)) throw new ErrorNegocio('Acto no válido para este expediente.');
    const valor = (limpiar(act.valor) ?? {}) as Record<string, unknown>;
    if (valor.plazo_anios !== undefined) valor.plazo_anios = Number(valor.plazo_anios);
    if (valor.precio !== undefined) valor.precio = Number(String(valor.precio).replace(/\D/g, ''));
    if (valor.valor_hipoteca !== undefined) valor.valor_hipoteca = Number(String(valor.valor_hipoteca).replace(/\D/g, ''));
    datos.actos[act.acto] = valor;
    errores = Object.assign({}, ...esq.pasos.map((p) => validarCampos(p.campos, valor, `actos.${act.acto}.`)));
    // Referencias a personas/inmuebles que ya no existen
    for (const [k, v] of Object.entries(valor)) {
      const ids = Array.isArray(v) ? v : [v];
      const esPersona = (/_id$/.test(k) && k !== 'inmueble_id') || /^(vendedores|compradores|deudores|conyuges)$/.test(k);
      if (esPersona && ids.some((x) => typeof x === 'string' && !datos.personas.some((p) => p.id === x))) errores[`actos.${act.acto}.${k}`] = 'Seleccione una persona registrada.';
      if (/^inmuebles?(_id)?$/.test(k) && ids.some((x) => typeof x === 'string' && !datos.inmuebles.some((i) => i.id === x))) errores[`actos.${act.acto}.${k}`] = 'Seleccione un inmueble registrado.';
    }
  }
  await db.expediente.update({ where: { id }, data: { datos: datos as unknown as Prisma.InputJsonValue } });
  await sincronizarEntidades(id, datos);
  await detectarCorrecciones(s, e, datos);
  await auditar({ ...datosAuditoria(s), accion: 'FORMULARIO_GUARDADO', entidad: 'expediente', entidadId: id, detalle: { paso: act.paso === 'acto' ? `acto:${act.acto}` : act.paso, errores: Object.keys(errores).length } });
  return { errores };
}

/** Copias normalizadas de personas e inmuebles (búsqueda y estadísticas) */
async function sincronizarEntidades(expedienteId: string, datos: DatosExpediente) {
  const roles = new Map<string, string[]>();
  for (const [acto, d] of Object.entries(datos.actos)) {
    for (const [campo, v] of Object.entries(d ?? {})) {
      for (const pid of (Array.isArray(v) ? v : [v])) if (typeof pid === 'string' && datos.personas.some((p) => p.id === pid)) roles.set(pid, [...(roles.get(pid) ?? []), `${acto}.${campo}`]);
    }
  }
  await db.$transaction([
    db.compareciente.deleteMany({ where: { expedienteId } }),
    db.inmueble.deleteMany({ where: { expedienteId } }),
    db.compareciente.createMany({ data: datos.personas.map((p) => ({ expedienteId, rol: (roles.get(p.id) ?? ['SIN_ROL']).join(','), tipoPersona: p.tipo_persona, nombre: p.nombre ?? '', tipoDocumento: p.tipo_documento ?? '', numeroDocumento: p.numero_documento ?? '', datos: p as unknown as Prisma.InputJsonValue })) }),
    db.inmueble.createMany({ data: datos.inmuebles.map((i) => ({ expedienteId, matricula: i.matricula ?? null, cedulaCatastral: i.cedula_catastral ?? null, direccion: i.direccion ?? null, datos: i as unknown as Prisma.InputJsonValue })) }),
  ]);
}

/** Ubica la entidad a la que apunta una sugerencia: persona por documento, inmueble por matrícula o catastral */
export function resolverDestino(datos: DatosExpediente, campo: string): { ruta: string; base: 'persona' | 'inmueble' | 'acto'; indice: number; subcampo: string } | null {
  const m = /^(persona|inmueble|catastral|acto):([^.]+)\.(.+)$/.exec(campo);
  if (!m) return null;
  const [, tipo, clave, subcampo] = m;
  const dig = (x: unknown) => String(x ?? '').replace(/\D/g, '');
  if (tipo === 'persona') {
    const i = datos.personas.findIndex((p) => dig(p.numero_documento) === dig(clave));
    return { ruta: `personas.${i}.${subcampo}`, base: 'persona', indice: i, subcampo };
  }
  if (tipo === 'inmueble') {
    const i = datos.inmuebles.findIndex((x) => (x.matricula ?? '').toUpperCase() === clave.toUpperCase());
    return { ruta: `inmuebles.${i}.${subcampo}`, base: 'inmueble', indice: i, subcampo };
  }
  if (tipo === 'catastral') {
    const i = datos.inmuebles.findIndex((x) => [x.cedula_catastral, x.cedula_catastral_paz_salvo].some((c) => dig(c) && (dig(c).endsWith(clave) || clave.endsWith(dig(c)))));
    return { ruta: `inmuebles.${i}.${subcampo}`, base: 'inmueble', indice: i, subcampo };
  }
  return { ruta: `actos.${clave}.${subcampo}`, base: 'acto', indice: 0, subcampo };
}

/** Si el usuario cambió un valor que venía de una sugerencia aceptada, se registra la corrección */
async function detectarCorrecciones(s: SesionActiva, e: Expediente, despues: DatosExpediente) {
  const aceptados = await db.datoExtraido.findMany({ where: { expedienteId: e.id, estado: 'ACEPTADO' } });
  for (const d of aceptados) {
    const destino = resolverDestino(despues, d.campo);
    if (!destino || destino.indice < 0) continue;
    const ahora = leerRuta(despues, destino.ruta);
    if (ahora === undefined || String(ahora) === String(d.valorFinal ?? d.valor)) continue;
    await db.datoExtraido.update({ where: { id: d.id }, data: { estado: 'CORREGIDO', valorFinal: ahora as Prisma.InputJsonValue } });
    await registrarCorreccion({ expedienteId: e.id, tipoId: e.tipoId, categoria: 'EXTRACCION', campo: d.campo, valorIA: d.valor, valorCorregido: ahora, creadoPorId: s.usuario.id, datos: despues });
  }
}

/** Escribe el valor de una sugerencia en los datos; crea la persona o el inmueble si no existe. false = no aplicable. */
function aplicarEnDatos(datos: DatosExpediente, campo: string, valor: unknown): boolean {
  let destino = resolverDestino(datos, campo);
  if (!destino) return false;
  if (destino.indice < 0) {
    const clave = campo.split(':')[1].split('.')[0];
    if (destino.base === 'persona') datos.personas.push({ id: crypto.randomUUID(), tipo_persona: 'NATURAL', nombre: '', tipo_documento: 'CC', numero_documento: clave, domicilio: 'la ciudad de Neiva (H)' } as Persona);
    else if (destino.base === 'inmueble') datos.inmuebles.push({ id: crypto.randomUUID(), tipo_inmueble: 'LOTE', direccion: '', municipio: 'Neiva', departamento: 'Huila', linderos: '', matricula: campo.startsWith('inmueble:') ? clave : '', orip: 'NEIVA - HUILA', cedula_catastral: campo.startsWith('catastral:') ? clave : '', tradicion: { modo: 'COMPRA', tradente: '', escritura_numero: '', escritura_fecha: '', notaria: '' }, fecha_certificado_tradicion: '' } as Inmueble);
    destino = resolverDestino(datos, campo)!;
  }
  escribirRuta(datos as unknown as Record<string, unknown>, destino.ruta, valor);
  return true;
}

/** Orden de aplicación: primero los inmuebles del certificado, para que el paz y salvo encuentre su cédula catastral */
const ORDEN_SUGERENCIA = ['inmueble:', 'persona:', 'catastral:', 'acto:'];
const ordenSugerencia = (campo: string) => ORDEN_SUGERENCIA.findIndex((p) => campo.startsWith(p));

/**
 * Asistente de IA: aplica de una vez las sugerencias confiables (confianza alta o media y formato
 * válido) que no chocan con otra sugerencia ni con un dato ya digitado. Las dudosas y las que
 * chocan quedan pendientes y se devuelven para que el asistente pregunte por ellas.
 */
export async function aplicarSugerenciasConfiables(s: SesionActiva, expedienteId: string) {
  const e = await obtenerExpediente(s, expedienteId);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('El expediente no se puede editar en su estado actual.');
  const datos = datosDe(e);
  const pendientes = await db.datoExtraido.findMany({ where: { expedienteId, estado: 'PENDIENTE' }, include: { documento: { select: { nombreOriginal: true } } }, orderBy: { creadoEn: 'asc' } });
  const porCampo = new Map<string, typeof pendientes>();
  for (const d of pendientes) porCampo.set(d.campo, [...(porCampo.get(d.campo) ?? []), d]);
  const aceptados: typeof pendientes = [];
  const dudosos: { campo: string; valores: { valor: unknown; documento: string; confianza: string }[]; motivo: string }[] = [];
  const iguales = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const [campo, grupo] of [...porCampo].sort(([a], [b]) => ordenSugerencia(a) - ordenSugerencia(b))) {
    const valores = grupo.map((d) => ({ valor: d.valor, documento: d.documento?.nombreOriginal ?? 'documento', confianza: d.confianza }));
    if (grupo.some((d) => d.revisionManual)) { dudosos.push({ campo, valores, motivo: 'confianza baja o formato dudoso' }); continue; }
    if (grupo.some((d) => !iguales(d.valor, grupo[0].valor))) { dudosos.push({ campo, valores, motivo: 'los documentos no coinciden' }); continue; }
    const destino = resolverDestino(datos, campo);
    const actual = destino && destino.indice >= 0 ? leerRuta(datos, destino.ruta) : undefined;
    if (actual !== undefined && actual !== '' && !iguales(actual, grupo[0].valor)) { dudosos.push({ campo, valores: [...valores, { valor: actual, documento: 'dato ya digitado', confianza: 'ALTA' }], motivo: 'el documento no coincide con lo digitado' }); continue; }
    if (aplicarEnDatos(datos, campo, grupo[0].valor)) aceptados.push(...grupo);
  }
  if (aceptados.length) {
    await db.$transaction([
      db.expediente.update({ where: { id: e.id }, data: { datos: datos as unknown as Prisma.InputJsonValue } }),
      ...aceptados.map((d) => db.datoExtraido.update({ where: { id: d.id }, data: { estado: 'ACEPTADO', valorFinal: d.valor as Prisma.InputJsonValue } })),
    ]);
    await sincronizarEntidades(e.id, datos);
    await auditar({ ...datosAuditoria(s), accion: 'SUGERENCIAS_APLICADAS_ASISTENTE', entidad: 'expediente', entidadId: e.id, detalle: { aplicadas: aceptados.length, dudosas: dudosos.length } });
  }
  return { aplicadas: aceptados.length, dudosos, datos };
}

/**
 * Asistente de IA: las sugerencias pendientes cuyo dato ya quedó definido por una respuesta se dan
 * por decididas (aceptada si coincide con lo respondido; corregida si no, y se registra para el aprendizaje).
 */
export async function cerrarSugerenciasRespondidas(s: SesionActiva, expedienteId: string) {
  const e = await obtenerExpediente(s, expedienteId);
  const datos = datosDe(e);
  const pendientes = await db.datoExtraido.findMany({ where: { expedienteId, estado: 'PENDIENTE' } });
  for (const d of pendientes) {
    const destino = resolverDestino(datos, d.campo);
    if (!destino || destino.indice < 0) continue;
    const actual = leerRuta(datos, destino.ruta);
    if (actual === undefined || actual === null || actual === '') continue;
    const coincide = JSON.stringify(actual) === JSON.stringify(d.valor);
    await db.datoExtraido.update({ where: { id: d.id }, data: { estado: coincide ? 'ACEPTADO' : 'CORREGIDO', valorFinal: actual as Prisma.InputJsonValue } });
    if (!coincide) await registrarCorreccion({ expedienteId, tipoId: e.tipoId, categoria: 'EXTRACCION', campo: d.campo, valorIA: d.valor, valorCorregido: actual, creadoPorId: s.usuario.id, datos });
  }
}

// ------------------------------------------------------------------ flujo de estados

async function cambiarEstado(s: SesionActiva, e: Expediente, estado: Expediente['estado'], accion: string, extra: Prisma.ExpedienteUpdateInput = {}, detalle?: Record<string, unknown>) {
  await db.expediente.update({ where: { id: e.id }, data: { estado, ...extra } });
  await auditar({ ...datosAuditoria(s), accion, entidad: 'expediente', entidadId: e.id, detalle: { de: e.estado, a: estado, ...detalle } });
}

/** Observaciones que impiden avanzar: críticas abiertas y advertencias sin resolver */
export async function bloqueos(expedienteId: string) {
  const abiertas = await db.observacion.findMany({ where: { expedienteId, estado: 'ABIERTA' } });
  return { criticas: abiertas.filter((o) => o.nivel === 'CRITICA'), advertencias: abiertas.filter((o) => o.nivel === 'ADVERTENCIA') };
}

export async function enviarARevision(s: SesionActiva, id: string) {
  const e = await obtenerExpediente(s, id);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('Solo el responsable puede enviar el expediente a revisión.');
  const b = await bloqueos(id);
  if (b.criticas.length) throw new ErrorNegocio(`Hay ${b.criticas.length} observación(es) CRÍTICA(S) abiertas: corrija los datos antes de enviar.`);
  if (b.advertencias.length) throw new ErrorNegocio(`Hay ${b.advertencias.length} advertencia(s) sin corregir ni justificar.`);
  const borrador = await db.borrador.findFirst({ where: { expedienteId: id }, orderBy: { version: 'desc' } });
  if (!borrador) throw new ErrorNegocio('Genere el borrador antes de enviarlo a revisión.');
  if (borrador.creadoEn < e.actualizadoEn) throw new ErrorNegocio('Los datos cambiaron después del último borrador: genérelo de nuevo.');
  await cambiarEstado(s, e, 'EN_REVISION', 'EXPEDIENTE_ENVIADO_REVISION', { enviadoRevisionEn: new Date() });
}

export async function aprobarExpediente(s: SesionActiva, id: string) {
  if (s.usuario.rol === 'DIGITADOR') throw new ErrorNegocio('Solo un revisor o el administrador aprueba.');
  const e = await obtenerExpediente(s, id);
  if (e.estado !== 'EN_REVISION') throw new ErrorNegocio('El expediente no está en revisión.');
  if (e.responsableId === s.usuario.id && s.usuario.rol !== 'ADMINISTRADOR') throw new ErrorNegocio('Quien elaboró el expediente no puede aprobarlo.');
  const b = await bloqueos(id);
  if (b.criticas.length || b.advertencias.length) throw new ErrorNegocio('Hay observaciones sin resolver.');
  await cambiarEstado(s, e, 'APROBADA', 'EXPEDIENTE_APROBADO', { aprobadoEn: new Date(), revisor: { connect: { id: s.usuario.id } } });
  if (e.responsableId !== s.usuario.id) {
    await notificar(e.responsableId, { titulo: `Escritura aprobada · ${e.numeroInterno}`, mensaje: `${s.usuario.nombre} aprobó la escritura: está lista para firma.`, enlace: `/expedientes/${id}` });
  }
}

export async function devolverExpediente(s: SesionActiva, id: string, comentario: string) {
  if (s.usuario.rol === 'DIGITADOR') throw new ErrorNegocio('Solo un revisor o el administrador devuelve expedientes.');
  if (comentario.trim().length < 10) throw new ErrorNegocio('Escriba un comentario que explique qué debe corregirse.');
  const e = await obtenerExpediente(s, id);
  if (e.estado !== 'EN_REVISION') throw new ErrorNegocio('El expediente no está en revisión.');
  await cambiarEstado(s, e, 'DEVUELTO', 'EXPEDIENTE_DEVUELTO', { comentarioRevision: comentario.trim(), revisor: { connect: { id: s.usuario.id } } });
  await registrarCorreccion({ expedienteId: id, tipoId: e.tipoId, categoria: 'REVISION', motivo: comentario, creadoPorId: s.usuario.id, datos: datosDe(e) });
  if (e.responsableId !== s.usuario.id) {
    await notificar(e.responsableId, { titulo: `Escritura devuelta · ${e.numeroInterno}`, mensaje: `${s.usuario.nombre} devolvió la escritura para corregir. Lea el comentario de la revisión en el expediente.`, enlace: `/expedientes/${id}` });
  }
}

export async function marcarFirmada(s: SesionActiva, id: string, numeroEscritura: number) {
  if (s.usuario.rol === 'DIGITADOR') throw new ErrorNegocio('Sin permiso.');
  const e = await obtenerExpediente(s, id);
  if (e.estado !== 'APROBADA') throw new ErrorNegocio('Solo se marca firmada una escritura aprobada (lista para firma).');
  if (!Number.isInteger(numeroEscritura) || numeroEscritura <= 0) throw new ErrorNegocio('Indique el número de escritura.');
  await cambiarEstado(s, e, 'FIRMADA', 'ESCRITURA_FIRMADA', { numeroEscritura }, { numeroEscritura });
}

export async function archivarExpediente(s: SesionActiva, id: string) {
  if (s.usuario.rol !== 'ADMINISTRADOR') throw new ErrorNegocio('Solo el administrador archiva.');
  const e = await obtenerExpediente(s, id);
  await cambiarEstado(s, e, 'ARCHIVADA', 'EXPEDIENTE_ARCHIVADO');
}

export async function reabrirExpediente(s: SesionActiva, id: string, motivo: string) {
  if (s.usuario.rol !== 'ADMINISTRADOR') throw new ErrorNegocio('Solo el administrador reabre.');
  if (motivo.trim().length < 10) throw new ErrorNegocio('Indique el motivo de la reapertura.');
  const e = await obtenerExpediente(s, id);
  await cambiarEstado(s, e, 'BORRADOR', 'EXPEDIENTE_REABIERTO', {}, { motivo });
}

export async function reasignarExpediente(s: SesionActiva, id: string, usuarioId: string) {
  if (s.usuario.rol !== 'ADMINISTRADOR') throw new ErrorNegocio('Solo el administrador reasigna.');
  const e = await obtenerExpediente(s, id);
  const u = await db.usuario.findUnique({ where: { id: usuarioId } });
  if (!u || u.estado !== 'ACTIVO') throw new ErrorNegocio('Usuario no válido para ser responsable.');
  await db.expediente.update({ where: { id }, data: { responsableId: usuarioId } });
  await auditar({ ...datosAuditoria(s), accion: 'EXPEDIENTE_REASIGNADO', entidad: 'expediente', entidadId: e.id, detalle: { de: e.responsableId, a: usuarioId } });
}
