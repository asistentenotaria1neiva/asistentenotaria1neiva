'use server';
/**
 * Acciones del panel del administrador. Todas exigen rol ADMINISTRADOR con doble factor
 * verificado (requerirSesion) y quedan en la auditoría.
 */
import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { Rol } from '@prisma/client';
import { db } from '@/lib/db';
import { requerirSesion, datosAuditoria } from '@/lib/sesion';
import { auditar, verificarCadena } from '@/lib/auditoria';
import { hashContrasena } from '@/lib/seguridad/contrasenas';
import { POR_DEFECTO, invalidarConfig, type Configuraciones } from '@/lib/configuracion';

export interface ResultadoAdmin { error?: string; ok?: string; secreto?: string }

const admin = () => requerirSesion({ roles: ['ADMINISTRADOR'] });
const t = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

async function hacer(ruta: string, fn: () => Promise<ResultadoAdmin | string>): Promise<ResultadoAdmin> {
  try {
    const r = await fn();
    revalidatePath(ruta);
    return typeof r === 'string' ? { ok: r } : r;
  } catch (e) {
    if (e instanceof ErrorAdmin) return { error: e.message };
    console.error('[admin]', e);
    return { error: 'No se pudo completar la acción.' };
  }
}
class ErrorAdmin extends Error {}

/** Contraseña temporal legible (el usuario debe cambiarla al ingresar) */
function contrasenaTemporal(): string {
  const base = crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, 'x');
  return `${base.slice(0, 4).toUpperCase()}${base.slice(4, 10)}${crypto.randomInt(10, 99)}`;
}

// ------------------------------------------------------------------ dispositivos

export async function accionDispositivo(_: ResultadoAdmin, f: FormData): Promise<ResultadoAdmin> {
  const s = await admin();
  const id = t(f, 'id');
  const op = t(f, 'operacion');
  return hacer('/admin/dispositivos', async () => {
    const d = await db.dispositivo.findUniqueOrThrow({ where: { id } });
    if (op === 'aprobar') await db.dispositivo.update({ where: { id }, data: { estado: 'APROBADO', aprobadoPorId: s.usuario.id, aprobadoEn: new Date() } });
    else if (op === 'revocar') {
      await db.$transaction([
        db.dispositivo.update({ where: { id }, data: { estado: 'REVOCADO' } }),
        // Revocación inmediata: todas las sesiones de ese equipo se cierran
        db.sesion.updateMany({ where: { dispositivoId: id, revocadaEn: null }, data: { revocadaEn: new Date(), motivoRevocacion: 'equipo desactivado por el administrador' } }),
      ]);
    } else if (op === 'eliminar') {
      await db.sesion.updateMany({ where: { dispositivoId: id, revocadaEn: null }, data: { revocadaEn: new Date(), motivoRevocacion: 'equipo eliminado' } });
      await db.sesion.updateMany({ where: { dispositivoId: id }, data: { dispositivoId: null } });
      await db.dispositivo.delete({ where: { id } });
    } else if (op === 'renombrar') {
      if (t(f, 'nombre').length < 3) throw new ErrorAdmin('Nombre demasiado corto.');
      await db.dispositivo.update({ where: { id }, data: { nombre: t(f, 'nombre').slice(0, 80) } });
    } else throw new ErrorAdmin('Operación no válida.');
    await auditar({ ...datosAuditoria(s), accion: `EQUIPO_${op.toUpperCase()}`, entidad: 'dispositivo', entidadId: id, detalle: { nombre: d.nombre } });
    return 'Hecho.';
  });
}

// ------------------------------------------------------------------ usuarios

export async function accionCrearUsuario(_: ResultadoAdmin, f: FormData): Promise<ResultadoAdmin> {
  const s = await admin();
  return hacer('/admin/usuarios', async () => {
    const usuario = t(f, 'usuario').toLowerCase();
    const rol = t(f, 'rol') as Rol;
    if (!/^[a-z0-9._-]{4,30}$/.test(usuario)) throw new ErrorAdmin('Usuario: 4 a 30 caracteres (minúsculas, números, punto, guion).');
    if (t(f, 'nombre').length < 5) throw new ErrorAdmin('Escriba el nombre completo.');
    if (!['ADMINISTRADOR', 'REVISOR', 'DIGITADOR'].includes(rol)) throw new ErrorAdmin('Rol no válido.');
    if (await db.usuario.findUnique({ where: { usuario } })) throw new ErrorAdmin('Ese usuario ya existe.');
    const temporal = contrasenaTemporal();
    const u = await db.usuario.create({ data: { usuario, nombreCompleto: t(f, 'nombre'), correo: t(f, 'correo') || null, rol, hashContrasena: await hashContrasena(temporal), debeCambiarContrasena: true } });
    await auditar({ ...datosAuditoria(s), accion: 'USUARIO_CREADO', entidad: 'usuario', entidadId: u.id, detalle: { usuario, rol } });
    return { ok: `Usuario ${usuario} creado. Entregue la contraseña temporal de forma personal; deberá cambiarla al ingresar.`, secreto: temporal };
  });
}

export async function accionUsuario(_: ResultadoAdmin, f: FormData): Promise<ResultadoAdmin> {
  const s = await admin();
  const id = t(f, 'id');
  const op = t(f, 'operacion');
  return hacer('/admin/usuarios', async () => {
    const u = await db.usuario.findUniqueOrThrow({ where: { id } });
    if (u.id === s.usuario.id && ['suspender', 'eliminar', 'rol'].includes(op)) throw new ErrorAdmin('No puede aplicar esa operación sobre su propia cuenta.');
    const cerrarSesiones = (motivo: string) => db.sesion.updateMany({ where: { usuarioId: id, revocadaEn: null }, data: { revocadaEn: new Date(), motivoRevocacion: motivo } });
    let resultado: ResultadoAdmin = { ok: 'Hecho.' };
    switch (op) {
      case 'suspender': await db.usuario.update({ where: { id }, data: { estado: 'SUSPENDIDO' } }); await cerrarSesiones('usuario suspendido'); break;
      case 'activar': await db.usuario.update({ where: { id }, data: { estado: 'ACTIVO', bloqueadoHasta: null, intentosFallidos: 0 } }); break;
      case 'desbloquear': await db.usuario.update({ where: { id }, data: { bloqueadoHasta: null, intentosFallidos: 0 } }); break;
      case 'cerrar_sesiones': await cerrarSesiones('cerradas por el administrador'); break;
      case 'rol': {
        const rol = t(f, 'rol') as Rol;
        if (!['ADMINISTRADOR', 'REVISOR', 'DIGITADOR'].includes(rol)) throw new ErrorAdmin('Rol no válido.');
        await db.usuario.update({ where: { id }, data: { rol } });
        await cerrarSesiones('cambio de rol');
        break;
      }
      case 'restablecer': {
        const temporal = contrasenaTemporal();
        await db.usuario.update({ where: { id }, data: { hashContrasena: await hashContrasena(temporal), debeCambiarContrasena: true, intentosFallidos: 0, bloqueadoHasta: null } });
        await cerrarSesiones('contraseña restablecida');
        resultado = { ok: `Contraseña de ${u.usuario} restablecida. Entréguela de forma personal.`, secreto: temporal };
        break;
      }
      case 'restablecer_2fa':
        await db.usuario.update({ where: { id }, data: { totpActivo: false, totpSecretoCifrado: null, totpUltimoCodigoHash: null } });
        await cerrarSesiones('doble factor restablecido');
        break;
      case 'eliminar': {
        const uso = await db.expediente.count({ where: { responsableId: id } });
        if (uso) throw new ErrorAdmin(`El usuario tiene ${uso} escritura(s) asociadas: suspéndalo en lugar de eliminarlo (la trazabilidad debe conservarse).`);
        await cerrarSesiones('usuario eliminado');
        await db.usuario.delete({ where: { id } });
        break;
      }
      default: throw new ErrorAdmin('Operación no válida.');
    }
    await auditar({ ...datosAuditoria(s), accion: `USUARIO_${op.toUpperCase()}`, entidad: 'usuario', entidadId: id, detalle: { usuario: u.usuario, ...(op === 'rol' ? { rol: t(f, 'rol') } : {}) } });
    return resultado;
  });
}

// ------------------------------------------------------------------ alertas, auditoría y configuración

export async function accionAlerta(_: ResultadoAdmin, f: FormData): Promise<ResultadoAdmin> {
  const s = await admin();
  return hacer('/admin/alertas', async () => {
    const id = t(f, 'id');
    if (id === 'todas') await db.alerta.updateMany({ where: { atendida: false }, data: { atendida: true } });
    else await db.alerta.update({ where: { id }, data: { atendida: true } });
    await auditar({ ...datosAuditoria(s), accion: 'ALERTA_ATENDIDA', entidad: 'alerta', entidadId: id });
    return 'Marcada como atendida.';
  });
}

export async function accionVerificarAuditoria(): Promise<ResultadoAdmin> {
  const s = await admin();
  const r = await verificarCadena();
  await auditar({ ...datosAuditoria(s), accion: 'AUDITORIA_VERIFICADA', detalle: { integra: r.integra, revisados: r.revisados, primeraFalla: r.primeraFalla?.toString() } });
  return r.integra
    ? { ok: `Cadena íntegra: ${r.revisados} registros verificados.` }
    : { error: `¡ATENCIÓN! La cadena de auditoría está alterada a partir del registro #${r.primeraFalla}. Informe de inmediato al notario.` };
}

export async function accionConfiguracion(_: ResultadoAdmin, f: FormData): Promise<ResultadoAdmin> {
  const s = await admin();
  return hacer('/admin/configuracion', async () => {
    const clave = t(f, 'clave') as keyof Configuraciones;
    if (!(clave in POR_DEFECTO)) throw new ErrorAdmin('Parámetro desconocido.');
    let valor: unknown;
    try { valor = JSON.parse(t(f, 'valor')); } catch { throw new ErrorAdmin('El valor no tiene un formato válido (JSON).'); }
    const def = POR_DEFECTO[clave];
    if (typeof def === 'number' && (typeof valor !== 'number' || valor <= 0)) throw new ErrorAdmin('Debe ser un número mayor que cero.');
    if (Array.isArray(def) && (!Array.isArray(valor) || valor.some((x) => typeof x !== 'string'))) throw new ErrorAdmin('Debe ser una lista de textos, p. ej. ["190.0.0.1"].');
    if (typeof def === 'object' && !Array.isArray(def) && (typeof valor !== 'object' || valor === null || Array.isArray(valor))) throw new ErrorAdmin('Debe ser un objeto con la misma estructura.');
    if (clave === 'ia.creditos') {
      const c = valor as { saldoUSD?: unknown; fecha?: unknown };
      if (typeof c.saldoUSD !== 'number' || c.saldoUSD < 0) throw new ErrorAdmin('saldoUSD debe ser un número (US$), p. ej. 25.40.');
      if (typeof c.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.fecha) || isNaN(Date.parse(c.fecha))) throw new ErrorAdmin('fecha debe tener el formato AAAA-MM-DD, p. ej. "2026-10-21".');
    }
    if (clave === 'red.ips_oficina' && Array.isArray(valor) && !valor.length) throw new ErrorAdmin('Debe haber al menos una IP de la oficina (si no, el personal no podría ingresar).');
    const anterior = await db.configuracion.findUnique({ where: { clave } });
    await db.configuracion.upsert({ where: { clave }, create: { clave, valor: valor as object, actualizadoPor: s.usuario.id }, update: { valor: valor as object, actualizadoPor: s.usuario.id } });
    invalidarConfig();
    await auditar({ ...datosAuditoria(s), accion: 'CONFIGURACION_CAMBIADA', entidad: 'configuracion', entidadId: clave, detalle: { anterior: (anterior?.valor ?? POR_DEFECTO[clave]) as object, nuevo: valor as object } });
    return `Parámetro "${clave}" actualizado.`;
  });
}
