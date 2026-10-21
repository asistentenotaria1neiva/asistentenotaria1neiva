/**
 * Límite de peticiones (rate limiting) por clave y ventana de tiempo, persistido en
 * la base de datos para que funcione aunque la app corra en varios procesos.
 */
import 'server-only';
import { db } from '../db';

export async function consumirLimite(clave: string, maximo: number, ventanaSegundos: number): Promise<{ permitido: boolean; restantes: number }> {
  const ahora = new Date();
  const fin = new Date(ahora.getTime() + ventanaSegundos * 1000);
  const r = await db.$transaction(async (tx) => {
    const actual = await tx.limitePeticiones.findUnique({ where: { clave } });
    if (!actual || actual.ventanaFin < ahora) {
      return tx.limitePeticiones.upsert({ where: { clave }, create: { clave, conteo: 1, ventanaFin: fin }, update: { conteo: 1, ventanaFin: fin } });
    }
    return tx.limitePeticiones.update({ where: { clave }, data: { conteo: { increment: 1 } } });
  });
  return { permitido: r.conteo <= maximo, restantes: Math.max(0, maximo - r.conteo) };
}
