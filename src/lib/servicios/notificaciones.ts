/**
 * Notificaciones para el usuario: el análisis de los documentos terminó, la escritura está lista
 * para generarse, fue aprobada o devuelta… Se ven en «Notificaciones» y, si la persona lo activa,
 * también como aviso del navegador (src/app/(app)/notificaciones/Avisos.tsx).
 * Nunca llevan datos personales del expediente: solo su número y qué pasó.
 */
import 'server-only';
import { db } from '../db';

export interface NuevaNotificacion { titulo: string; mensaje: string; enlace?: string }

/** Avisar nunca hace fallar la operación que lo origina */
export async function notificar(usuarioId: string, n: NuevaNotificacion): Promise<void> {
  await db.notificacion.create({ data: { usuarioId, titulo: n.titulo.slice(0, 200), mensaje: n.mensaje.slice(0, 1000), enlace: n.enlace } })
    .catch((e) => console.error('[notificaciones]', e));
}

export const noLeidas = (usuarioId: string) => db.notificacion.count({ where: { usuarioId, leidaEn: null } });

export async function listarNotificaciones(usuarioId: string, limite = 50) {
  return db.notificacion.findMany({ where: { usuarioId }, orderBy: { creadaEn: 'desc' }, take: limite });
}

/** Las no leídas creadas después de `desde` (para los avisos del navegador) */
export async function notificacionesNuevas(usuarioId: string, desde: Date) {
  return db.notificacion.findMany({ where: { usuarioId, leidaEn: null, creadaEn: { gt: desde } }, orderBy: { creadaEn: 'asc' }, take: 10 });
}

export async function marcarLeidas(usuarioId: string, ids?: string[]) {
  await db.notificacion.updateMany({ where: { usuarioId, leidaEn: null, ...(ids ? { id: { in: ids } } : {}) }, data: { leidaEn: new Date() } });
}
