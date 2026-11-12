/**
 * Escrituras (expedientes): el digitador elige una plantilla de la biblioteca (o carga una personal),
 * carga los documentos, escribe sus observaciones y genera la escritura (src/lib/servicios/generacion.ts).
 *
 * Permisos: el digitador y el revisor ven y trabajan solo sus escrituras; el administrador ve y
 * trabaja todas.
 */
import 'server-only';
import { cache } from 'react';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { guardarCifrado, leerCifrado, borrarCifrado } from '../almacenamiento';
import { documentoXml, textoDocx, ErrorDocx } from '../escritura/docx';
import { terminosBusqueda } from '../texto/normalizar';
import { archivoPlantilla } from './plantillas';

export class ErrorNegocio extends Error {}

/** Tamaño máximo de una plantilla personal (las de la notaría pesan menos de 3 MB) */
export const MAXIMO_PLANTILLA = 4 * 1024 * 1024;

// ------------------------------------------------------------------ permisos

export function puedeVer(s: SesionActiva, e: { responsableId: string }): boolean {
  return s.usuario.rol === 'ADMINISTRADOR' || e.responsableId === s.usuario.id;
}

export function puedeEditar(s: SesionActiva, e: { responsableId: string }): boolean {
  return s.usuario.rol === 'ADMINISTRADOR' || e.responsableId === s.usuario.id;
}

export async function obtenerExpediente(s: SesionActiva, id: string) {
  const e = await db.expediente.findUnique({
    where: { id },
    include: { responsable: { select: { nombreCompleto: true } }, plantilla: { select: { id: true, nombre: true, categoria: true, subcategoria: true, anio: true, fecha: true, activa: true } } },
  });
  if (!e || !puedeVer(s, e)) throw new ErrorNegocio('Escritura no encontrada o sin permiso.');
  return e;
}

/** obtenerExpediente para el renderizado (una sola consulta por petición) */
export const expedienteDePagina = cache(obtenerExpediente);

export async function expedienteEditable(s: SesionActiva, id: string) {
  const e = await obtenerExpediente(s, id);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('Solo el responsable de la escritura puede modificarla.');
  return e;
}

// ------------------------------------------------------------------ plantilla

/** Valida una plantilla personal (.docx con texto) y la guarda cifrada */
async function guardarPlantillaPersonal(bytes: Buffer): Promise<string> {
  if (!bytes.length) throw new ErrorNegocio('El archivo está vacío.');
  if (bytes.length > MAXIMO_PLANTILLA) throw new ErrorNegocio('La plantilla pesa más de 4 MB.');
  try {
    documentoXml(bytes);
    if (textoDocx(bytes).length < 200) throw new ErrorNegocio('La plantilla casi no tiene texto: cargue la escritura modelo en Word.');
  } catch (e) {
    if (e instanceof ErrorDocx) throw new ErrorNegocio(`${e.message} Las plantillas .doc antiguas se abren en Word y se guardan como .docx.`);
    throw e;
  }
  return guardarCifrado(bytes, 'plantillas');
}

export type EleccionPlantilla = { plantillaId: string } | { personal: { nombre: string; bytes: Buffer } };

async function datosPlantilla(eleccion: EleccionPlantilla) {
  if ('plantillaId' in eleccion) {
    const p = await db.plantilla.findUnique({ where: { id: eleccion.plantillaId }, select: { id: true, nombre: true, activa: true } });
    if (!p || !p.activa) throw new ErrorNegocio('La plantilla ya no está disponible en la biblioteca.');
    return { plantillaId: p.id, plantillaNombre: p.nombre, plantillaRuta: null };
  }
  const nombre = eleccion.personal.nombre.replace(/\.docx$/i, '').replace(/[^\p{L}\p{N} ._()-]/gu, ' ').trim().slice(0, 150) || 'Plantilla personal';
  return { plantillaId: null, plantillaNombre: `${nombre} (personal)`, plantillaRuta: await guardarPlantillaPersonal(eleccion.personal.bytes) };
}

/** El .docx de la plantilla de la escritura (de la biblioteca o personal) */
export async function bytesPlantilla(e: { plantillaId: string | null; plantillaRuta: string | null }): Promise<Buffer> {
  if (e.plantillaRuta) return leerCifrado(e.plantillaRuta);
  if (e.plantillaId) return archivoPlantilla(e.plantillaId);
  throw new ErrorNegocio('La plantilla de esta escritura se retiró de la biblioteca. Elija otra.');
}

// ------------------------------------------------------------------ creación y edición

export async function crearExpediente(s: SesionActiva, eleccion: EleccionPlantilla, titulo?: string): Promise<string> {
  const plantilla = await datosPlantilla(eleccion);
  const anio = new Date().getFullYear();
  const exp = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(515151)`;
    const ultimo = await tx.expediente.findFirst({ where: { numeroInterno: { startsWith: `EXP-${anio}-` } }, orderBy: { numeroInterno: 'desc' }, select: { numeroInterno: true } });
    const n = Number(ultimo?.numeroInterno.split('-')[2] ?? 0) + 1;
    return tx.expediente.create({
      data: { numeroInterno: `EXP-${anio}-${String(n).padStart(5, '0')}`, titulo: titulo?.trim().slice(0, 200) || null, responsableId: s.usuario.id, ...plantilla },
    });
  });
  await auditar({ ...datosAuditoria(s), accion: 'EXPEDIENTE_CREADO', entidad: 'expediente', entidadId: exp.id, detalle: { numero: exp.numeroInterno, plantillaId: exp.plantillaId, plantilla: exp.plantillaNombre } });
  return exp.id;
}

export async function cambiarPlantilla(s: SesionActiva, id: string, eleccion: EleccionPlantilla) {
  const e = await expedienteEditable(s, id);
  if (await db.generacion.count({ where: { expedienteId: id, estado: 'EN_CURSO' } })) throw new ErrorNegocio('La IA está generando la escritura con la plantilla actual. Espere a que termine para cambiarla.');
  const plantilla = await datosPlantilla(eleccion);
  await db.expediente.update({ where: { id }, data: plantilla });
  if (e.plantillaRuta) await borrarCifrado(e.plantillaRuta).catch((err) => console.error('[cambiarPlantilla]', err));
  await auditar({ ...datosAuditoria(s), accion: 'EXPEDIENTE_PLANTILLA_CAMBIADA', entidad: 'expediente', entidadId: id, detalle: { antes: e.plantillaNombre, ahora: plantilla.plantillaNombre } });
}

export async function guardarObservaciones(s: SesionActiva, id: string, datos: { observaciones?: string; titulo?: string }) {
  await expedienteEditable(s, id);
  await db.expediente.update({
    where: { id },
    data: {
      ...(datos.observaciones !== undefined ? { observaciones: datos.observaciones.trim().slice(0, 8000) || null } : {}),
      ...(datos.titulo !== undefined ? { titulo: datos.titulo.trim().slice(0, 200) || null } : {}),
    },
  });
}

/** Elimina la escritura con sus documentos, versiones generadas y plantilla personal (y sus archivos cifrados) */
export async function eliminarExpediente(s: SesionActiva, id: string) {
  const e = await expedienteEditable(s, id);
  const [docs, gens] = await Promise.all([
    db.documento.findMany({ where: { expedienteId: id }, select: { rutaCifrada: true } }),
    db.generacion.findMany({ where: { expedienteId: id }, select: { rutaDocx: true, estado: true } }),
  ]);
  if (gens.some((g) => g.estado === 'EN_CURSO')) throw new ErrorNegocio('La IA está generando esta escritura. Espere a que termine.');
  await db.expediente.delete({ where: { id } });
  const rutas = [...docs.map((d) => d.rutaCifrada), ...gens.map((g) => g.rutaDocx).filter((x): x is string => !!x), ...(e.plantillaRuta ? [e.plantillaRuta] : [])];
  await Promise.all(rutas.map((r) => borrarCifrado(r).catch((err) => console.error('[eliminarExpediente]', err))));
  await auditar({ ...datosAuditoria(s), accion: 'EXPEDIENTE_ELIMINADO', entidad: 'expediente', entidadId: id, detalle: { numero: e.numeroInterno, documentos: docs.length, versiones: gens.length } });
}

// ------------------------------------------------------------------ listado

export async function listarExpedientes(s: SesionActiva, filtro: { q?: string; soloPropios?: boolean; responsableId?: string; limite?: number }) {
  const terminos = terminosBusqueda(filtro.q ?? '');
  const where: Prisma.ExpedienteWhereInput = {
    ...(s.usuario.rol !== 'ADMINISTRADOR' || filtro.soloPropios ? { responsableId: s.usuario.id } : filtro.responsableId ? { responsableId: filtro.responsableId } : {}),
    ...(terminos.length ? {
      AND: terminos.map((t) => ({ OR: [
        { numeroInterno: { contains: t, mode: 'insensitive' as const } },
        { titulo: { contains: t, mode: 'insensitive' as const } },
        { plantillaNombre: { contains: t, mode: 'insensitive' as const } },
      ] })),
    } : {}),
  };
  return db.expediente.findMany({
    where, orderBy: { actualizadoEn: 'desc' }, take: filtro.limite ?? 100,
    select: {
      id: true, numeroInterno: true, titulo: true, plantillaNombre: true, actualizadoEn: true,
      responsable: { select: { nombreCompleto: true } },
      plantilla: { select: { categoria: true } },
      _count: { select: { documentos: true } },
      generaciones: { orderBy: { version: 'desc' }, take: 1, select: { version: true, estado: true, creadaEn: true } },
    },
  });
}
