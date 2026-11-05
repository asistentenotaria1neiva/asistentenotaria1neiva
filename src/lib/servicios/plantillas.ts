/**
 * Plantillas: el modelo de redacción (.docx, sin variables) de cada tipo de escritura, versionado.
 * Toda plantilla nueva entra como PENDIENTE_APROBACION; solo el administrador la aprueba.
 * La IA redacta cada escritura tomando como base la versión APROBADA más reciente de su tipo
 * (src/lib/servicios/redaccion.ts).
 */
import 'server-only';
import PizZip from 'pizzip';
import { db } from '../db';
import { sha256 } from '../seguridad/cifrado';

export class ErrorPlantilla extends Error {}

export async function plantillaAprobada(tipoId: string) {
  const p = await db.plantilla.findFirst({ where: { tipoId, estado: 'APROBADA' }, orderBy: { version: 'desc' } });
  if (!p) throw new ErrorPlantilla(`No hay una plantilla APROBADA para "${tipoId}". El administrador debe aprobarla en Plantillas.`);
  return p;
}

/** Cargador para la redacción: devuelve el .docx aprobado y registra qué versión se usó */
export function cargadorAprobadas(usadas: { tipoId: string; version: number; id: string }[]) {
  return async (tipoId: string) => {
    const p = await plantillaAprobada(tipoId);
    if (!usadas.some((u) => u.id === p.id)) usadas.push({ tipoId, version: p.version, id: p.id });
    return Buffer.from(p.archivo);
  };
}

/** Verifica que un .docx sea una plantilla válida: zip legible, con documento principal y texto */
export function validarDocxPlantilla(archivo: Buffer): { ok: true } | { ok: false; error: string } {
  if (archivo.length > 5 * 1024 * 1024) return { ok: false, error: 'La plantilla supera 5 MB.' };
  if (archivo.subarray(0, 2).toString() !== 'PK') return { ok: false, error: 'El archivo no es un .docx válido.' };
  try {
    const zip = new PizZip(archivo);
    const xml = zip.file('word/document.xml')?.asText();
    if (!xml) return { ok: false, error: 'El .docx no tiene documento principal.' };
    if (!/<w:t[\s>]/.test(xml)) return { ok: false, error: 'El .docx no tiene texto.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'El archivo no es un .docx válido.' };
  }
}

export async function cargarPlantilla(tipoId: string, nombreArchivo: string, archivo: Buffer, usuarioId: string | null, notas?: string) {
  const v = validarDocxPlantilla(archivo);
  if (!v.ok) throw new ErrorPlantilla(v.error);
  const ultima = await db.plantilla.findFirst({ where: { tipoId }, orderBy: { version: 'desc' } });
  return db.plantilla.create({
    data: { tipoId, version: (ultima?.version ?? 0) + 1, nombreArchivo, archivo: new Uint8Array(archivo), hashSha256: sha256(archivo), notas, cargadaPorId: usuarioId },
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
