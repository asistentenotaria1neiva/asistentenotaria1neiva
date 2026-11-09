/**
 * Plantillas: el modelo de redacción (.docx, sin variables) de cada tipo de escritura, versionado.
 * Toda plantilla nueva entra como PENDIENTE_APROBACION; solo el administrador la aprueba.
 * La IA redacta cada escritura tomando como base la versión APROBADA más reciente de su tipo
 * (src/lib/servicios/redaccion.ts).
 *
 * Variantes: un tipo con `variantes` (p. ej. la compraventa con hipoteca, cuya estructura cambia
 * según el banco o la obra) tiene varias plantillas aprobadas a la vez, una por variante. Las
 * versiones de una variante comparten su nombre; aprobar una retira solo la anterior de esa misma
 * variante. Al redactar, la IA elige la variante según los documentos del caso
 * (src/lib/servicios/eleccion-plantilla.ts), o el funcionario la indica.
 */
import 'server-only';
import PizZip from 'pizzip';
import { db } from '../db';
import { sha256 } from '../seguridad/cifrado';

export class ErrorPlantilla extends Error {}

/** Nombre de la variante (las cargadas sin nombre se identifican por su archivo) */
export const nombreVariante = (p: { variante: string | null; nombreArchivo: string }) => p.variante?.trim() || p.nombreArchivo.replace(/\.docx$/i, '');
/** Clave para comparar nombres de variante (sin tildes, mayúsculas ni espacios de más) */
const claveVariante = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const mismaVariante = (a: { variante: string | null; nombreArchivo: string }, b: { variante: string | null; nombreArchivo: string }) => claveVariante(nombreVariante(a)) === claveVariante(nombreVariante(b));

export async function plantillaAprobada(tipoId: string) {
  const p = await db.plantilla.findFirst({ where: { tipoId, estado: 'APROBADA' }, orderBy: { version: 'desc' } });
  if (!p) throw new ErrorPlantilla(`No hay una plantilla APROBADA para "${tipoId}". El administrador debe aprobarla en Plantillas.`);
  return p;
}

/** Todas las plantillas aprobadas de un tipo (en un tipo con variantes, una por variante), la más reciente primero */
export async function plantillasAprobadas(tipoId: string) {
  const lista = await db.plantilla.findMany({ where: { tipoId, estado: 'APROBADA' }, orderBy: { version: 'desc' } });
  if (!lista.length) throw new ErrorPlantilla(`No hay una plantilla APROBADA para "${tipoId}". El administrador debe aprobarla en Plantillas.`);
  return lista;
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

export interface DatosVariante { variante?: string | null; criterios?: string | null }

const limpiarVariante = (d: DatosVariante) => ({
  variante: d.variante?.trim().replace(/\s+/g, ' ').slice(0, 120) || null,
  criterios: d.criterios?.trim().slice(0, 2000) || null,
});

export async function cargarPlantilla(tipoId: string, nombreArchivo: string, archivo: Buffer, usuarioId: string | null, notas?: string, variante: DatosVariante = {}) {
  const v = validarDocxPlantilla(archivo);
  if (!v.ok) throw new ErrorPlantilla(v.error);
  const ultima = await db.plantilla.findFirst({ where: { tipoId }, orderBy: { version: 'desc' } });
  return db.plantilla.create({
    data: { tipoId, version: (ultima?.version ?? 0) + 1, nombreArchivo, archivo: new Uint8Array(archivo), hashSha256: sha256(archivo), notas, cargadaPorId: usuarioId, ...limpiarVariante(variante) },
  });
}

/** Aprobadas que deja retiradas aprobar `p`: todas las del tipo o, si el tipo tiene variantes, las de su misma variante */
async function aRetirar(p: { id: string; tipoId: string; variante: string | null; nombreArchivo: string }): Promise<string[]> {
  const tipo = await db.tipoEscritura.findUnique({ where: { id: p.tipoId }, select: { variantes: true } });
  const aprobadas = await db.plantilla.findMany({ where: { tipoId: p.tipoId, estado: 'APROBADA', id: { not: p.id } }, select: { id: true, variante: true, nombreArchivo: true } });
  return aprobadas.filter((a) => !tipo?.variantes || mismaVariante(a, p)).map((a) => a.id);
}

export async function aprobarPlantilla(id: string, usuarioId: string) {
  const p = await db.plantilla.findUniqueOrThrow({ where: { id } });
  const retirar = await aRetirar(p);
  await db.$transaction([
    // Al aprobar una versión, las aprobadas anteriores del mismo tipo (o de la misma variante) quedan retiradas
    db.plantilla.updateMany({ where: { id: { in: retirar } }, data: { estado: 'RETIRADA' } }),
    db.plantilla.update({ where: { id }, data: { estado: 'APROBADA', aprobadaPorId: usuarioId, aprobadaEn: new Date() } }),
  ]);
  return { ...p, retiradas: retirar.length };
}

/**
 * Aprueba de una vez las versiones pendientes de un tipo con variantes. Si una variante tiene varias
 * pendientes, queda aprobada la más reciente. Devuelve las aprobadas.
 */
export async function aprobarPendientesDeVariantes(tipoId: string, usuarioId: string, ids?: string[]) {
  const tipo = await db.tipoEscritura.findUnique({ where: { id: tipoId }, select: { variantes: true } });
  if (!tipo?.variantes) throw new ErrorPlantilla('Este tipo de escritura no tiene variantes: apruebe la versión en su propia página.');
  const pendientes = await db.plantilla.findMany({
    where: { tipoId, estado: 'PENDIENTE_APROBACION', ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { version: 'asc' }, select: { id: true, tipoId: true, version: true, variante: true, nombreArchivo: true },
  });
  if (!pendientes.length) throw new ErrorPlantilla('No hay versiones pendientes de aprobación.');
  const aprobadas: typeof pendientes = [];
  for (const p of pendientes) {
    await aprobarPlantilla(p.id, usuarioId);
    aprobadas.push(p);
  }
  return aprobadas;
}

/** Cambia el nombre de la variante o sus criterios de elección (no el texto: eso es una versión nueva) */
export async function actualizarVariante(id: string, datos: DatosVariante) {
  const p = await db.plantilla.findUnique({ where: { id }, include: { tipo: { select: { variantes: true } } } });
  if (!p) throw new ErrorPlantilla('La plantilla no existe.');
  if (!p.tipo.variantes) throw new ErrorPlantilla('Este tipo de escritura no tiene variantes.');
  const nuevos = limpiarVariante(datos);
  if (!nuevos.variante) throw new ErrorPlantilla('Escriba el nombre de la variante.');
  // Si se renombra, todas las versiones de la variante pasan al nombre nuevo (siguen siendo la misma variante)
  const hermanas = (await db.plantilla.findMany({ where: { tipoId: p.tipoId }, select: { id: true, variante: true, nombreArchivo: true } })).filter((x) => mismaVariante(x, p)).map((x) => x.id);
  const otra = (await db.plantilla.findMany({ where: { tipoId: p.tipoId, id: { notIn: hermanas } }, select: { variante: true, nombreArchivo: true } })).find((x) => mismaVariante(x, { variante: nuevos.variante, nombreArchivo: '' }));
  if (otra) throw new ErrorPlantilla(`Ya existe otra variante llamada «${nombreVariante(otra)}».`);
  await db.$transaction([
    db.plantilla.updateMany({ where: { id: { in: hermanas } }, data: { variante: nuevos.variante } }),
    db.plantilla.update({ where: { id }, data: { criterios: nuevos.criterios } }),
  ]);
  return { ...p, ...nuevos };
}

/** Activa o desactiva las variantes de un tipo. Para desactivarlas debe quedar una sola aprobada. */
export async function cambiarVariantes(tipoId: string, activar: boolean) {
  if (!activar) {
    const aprobadas = await db.plantilla.count({ where: { tipoId, estado: 'APROBADA' } });
    if (aprobadas > 1) throw new ErrorPlantilla(`Hay ${aprobadas} variantes aprobadas. Retire las que sobran hasta dejar una antes de desactivar las variantes.`);
  }
  return db.tipoEscritura.update({ where: { id: tipoId }, data: { variantes: activar } });
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
