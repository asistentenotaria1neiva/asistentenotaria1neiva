/**
 * Registro de auditoría inmodificable.
 *  - La base de datos bloquea UPDATE, DELETE y TRUNCATE sobre la tabla (disparadores).
 *  - Cada fila guarda el hash de la anterior: alterar o borrar una fila (aun desactivando
 *    los disparadores) rompe la cadena y la verificación lo detecta.
 *  - Las inserciones se serializan con un bloqueo de PostgreSQL para que la cadena sea lineal.
 */
import 'server-only';
import crypto from 'node:crypto';
import { db } from './db';

export interface EventoAuditoria {
  accion: string; // p. ej. SESION_INICIADA, EXPEDIENTE_CREADO, DOCUMENTO_DESCARGADO
  usuarioId?: string | null;
  usuarioNombre?: string | null;
  dispositivoId?: string | null;
  ip?: string | null;
  entidad?: string | null;
  entidadId?: string | null;
  detalle?: Record<string, unknown> | null;
}

const GENESIS = '0'.repeat(64);

/** JSON con claves ordenadas: PostgreSQL (jsonb) reordena las claves, así que el hash debe ser independiente del orden */
export function jsonCanonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor ?? null);
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
  const obj = valor as Record<string, unknown>;
  return `{${Object.keys(obj).filter((k) => obj[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${jsonCanonico(obj[k])}`).join(',')}}`;
}

export function calcularHash(hashAnterior: string, fechaISO: string, ev: EventoAuditoria): string {
  const contenido = jsonCanonico([hashAnterior, fechaISO, ev.accion, ev.usuarioId ?? null, ev.usuarioNombre ?? null,
    ev.dispositivoId ?? null, ev.ip ?? null, ev.entidad ?? null, ev.entidadId ?? null, ev.detalle ?? null]);
  return crypto.createHash('sha256').update(contenido).digest('hex');
}

export async function auditar(ev: EventoAuditoria): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(424242)`;
    const ultimo = await tx.auditoria.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
    const hashAnterior = ultimo?.hash ?? GENESIS;
    // Precisión de milisegundos, igual a la que guarda PostgreSQL, para poder recalcular el hash
    const fecha = new Date(Math.floor(Date.now()));
    const hash = calcularHash(hashAnterior, fecha.toISOString(), ev);
    await tx.auditoria.create({
      data: {
        fecha, hashAnterior, hash, accion: ev.accion, usuarioId: ev.usuarioId ?? null, usuarioNombre: ev.usuarioNombre ?? null,
        dispositivoId: ev.dispositivoId ?? null, ip: ev.ip ?? null, entidad: ev.entidad ?? null, entidadId: ev.entidadId ?? null,
        detalle: (ev.detalle ?? undefined) as object | undefined,
      },
    });
  });
}

/** Recorre la cadena completa y devuelve el primer registro alterado, si lo hay */
export async function verificarCadena(): Promise<{ integra: boolean; revisados: number; primeraFalla?: bigint }> {
  let anterior = GENESIS;
  let revisados = 0;
  let cursor: bigint | undefined;
  for (;;) {
    const lote = await db.auditoria.findMany({ orderBy: { id: 'asc' }, take: 1000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!lote.length) break;
    for (const f of lote) {
      const esperado = calcularHash(anterior, f.fecha.toISOString(), {
        accion: f.accion, usuarioId: f.usuarioId, usuarioNombre: f.usuarioNombre, dispositivoId: f.dispositivoId, ip: f.ip,
        entidad: f.entidad, entidadId: f.entidadId, detalle: (f.detalle as Record<string, unknown> | null) ?? null,
      });
      if (f.hashAnterior !== anterior || f.hash !== esperado) return { integra: false, revisados, primeraFalla: f.id };
      anterior = f.hash;
      revisados++;
    }
    cursor = lote[lote.length - 1].id;
  }
  return { integra: true, revisados };
}

/** Alerta para el panel del administrador (accesos no autorizados, bloqueos, actividad inusual) */
export async function alertar(tipo: string, severidad: 'ALTA' | 'MEDIA' | 'BAJA', mensaje: string, datos?: Record<string, unknown>) {
  await db.alerta.create({ data: { tipo, severidad, mensaje, datos: (datos ?? undefined) as object | undefined } });
}
