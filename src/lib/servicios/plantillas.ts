/**
 * Plantillas (.docx con variables) y esquemas de formulario, versionados.
 * Toda plantilla nueva entra como PENDIENTE_APROBACION; solo el administrador la aprueba.
 * El borrador solo se genera con la versión APROBADA más reciente de cada bloque.
 */
import 'server-only';
import type { Prisma } from '@prisma/client';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import expressionParser from 'docxtemplater/expressions.js';
import { db } from '../db';
import { sha256 } from '../seguridad/cifrado';
import { filtrosConcordancia } from '../texto/concordancia';

export class ErrorPlantilla extends Error {}

export async function plantillaAprobada(tipoId: string) {
  const p = await db.plantilla.findFirst({ where: { tipoId, estado: 'APROBADA' }, orderBy: { version: 'desc' } });
  if (!p) throw new ErrorPlantilla(`No hay una plantilla APROBADA para "${tipoId}". El administrador debe aprobarla en Plantillas.`);
  return p;
}

/** Cargador para el generador: devuelve el .docx aprobado y registra qué versión se usó */
export function cargadorAprobadas(usadas: { tipoId: string; version: number; id: string }[]) {
  return async (tipoId: string) => {
    const p = await plantillaAprobada(tipoId);
    if (!usadas.some((u) => u.id === p.id)) usadas.push({ tipoId, version: p.version, id: p.id });
    return Buffer.from(p.archivo);
  };
}

/** Verifica que un .docx sea una plantilla válida (zip legible y etiquetas {{ }} bien formadas) */
export function validarDocxPlantilla(archivo: Buffer): { ok: true; etiquetas: number } | { ok: false; error: string } {
  if (archivo.length > 5 * 1024 * 1024) return { ok: false, error: 'La plantilla supera 5 MB.' };
  if (archivo.subarray(0, 2).toString() !== 'PK') return { ok: false, error: 'El archivo no es un .docx válido.' };
  try {
    const zip = new PizZip(archivo);
    if (!zip.file('word/document.xml')) return { ok: false, error: 'El .docx no tiene documento principal.' };
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: '{{', end: '}}' }, parser: expressionParser.configure({ filters: filtrosConcordancia }) });
    const texto = doc.getFullText();
    return { ok: true, etiquetas: (texto.match(/\{\{/g) ?? []).length };
  } catch (e) {
    const detalle = (e as { properties?: { errors?: { properties?: { explanation?: string } }[] } }).properties?.errors?.map((x) => x.properties?.explanation).filter(Boolean).join('; ');
    return { ok: false, error: `La plantilla tiene etiquetas mal formadas: ${detalle || (e as Error).message}` };
  }
}

/** `variabilizacion`: resumen de la conversión del caso real en plantilla, si la hubo (variabilizar-plantilla.ts) */
export async function cargarPlantilla(tipoId: string, nombreArchivo: string, archivo: Buffer, usuarioId: string | null, notas?: string, variabilizacion?: Prisma.InputJsonValue) {
  const v = validarDocxPlantilla(archivo);
  if (!v.ok) throw new ErrorPlantilla(v.error);
  const ultima = await db.plantilla.findFirst({ where: { tipoId }, orderBy: { version: 'desc' } });
  return db.plantilla.create({
    data: { tipoId, version: (ultima?.version ?? 0) + 1, nombreArchivo, archivo: new Uint8Array(archivo), hashSha256: sha256(archivo), notas, cargadaPorId: usuarioId, variabilizacion },
  });
}

export async function aprobarPlantilla(id: string, usuarioId: string) {
  const p = await db.plantilla.findUniqueOrThrow({ where: { id } });
  await db.$transaction([
    // Al aprobar una versión, las aprobadas anteriores del mismo tipo quedan retiradas
    db.plantilla.updateMany({ where: { tipoId: p.tipoId, estado: 'APROBADA', id: { not: id } }, data: { estado: 'RETIRADA' } }),
    db.plantilla.update({ where: { id }, data: { estado: 'APROBADA', aprobadaPorId: usuarioId, aprobadaEn: new Date() } }),
  ]);
  return p;
}

export async function retirarPlantilla(id: string) {
  return db.plantilla.update({ where: { id }, data: { estado: 'RETIRADA' } });
}

/** Versiones de un tipo con las que ya se generó algún borrador: se conservan para saber con qué se hizo */
async function versionesUsadas(tipoId: string): Promise<Set<number>> {
  const borradores = await db.borrador.findMany({ select: { plantillasUsadas: true } });
  return new Set(borradores.flatMap((b) => (Array.isArray(b.plantillasUsadas) ? b.plantillasUsadas as { tipoId?: string; version?: number }[] : []))
    .filter((u) => u.tipoId === tipoId && typeof u.version === 'number').map((u) => u.version!));
}

/** Elimina una versión (el tipo de escritura y las demás versiones quedan). Devuelve la versión eliminada. */
export async function eliminarVersionPlantilla(id: string) {
  const p = await db.plantilla.findUnique({ where: { id }, select: { id: true, tipoId: true, version: true, estado: true, hashSha256: true } });
  if (!p) throw new ErrorPlantilla('La plantilla no existe.');
  if ((await versionesUsadas(p.tipoId)).has(p.version)) throw new ErrorPlantilla(`Con la versión ${p.version} ya se generaron borradores: no se puede eliminar. Puede retirarla.`);
  await db.plantilla.delete({ where: { id } });
  return p;
}

/** Elimina todas las versiones de la plantilla de un tipo; el tipo de escritura queda (se le puede cargar otra) */
export async function eliminarPlantillaCompleta(tipoId: string) {
  const versiones = await db.plantilla.findMany({ where: { tipoId }, select: { version: true, estado: true, hashSha256: true } });
  if (!versiones.length) throw new ErrorPlantilla('Este tipo no tiene plantillas.');
  const usadas = await versionesUsadas(tipoId);
  if (versiones.some((v) => usadas.has(v.version))) throw new ErrorPlantilla(`Con las versiones ${[...usadas].sort((a, b) => a - b).join(', ')} ya se generaron borradores: no se pueden eliminar. Elimine las demás una por una o retírelas.`);
  await db.plantilla.deleteMany({ where: { tipoId } });
  return versiones;
}
