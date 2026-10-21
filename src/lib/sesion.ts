/**
 * Autenticación, sesiones y control de equipos (sección 5.1 y módulo de inicio de sesión).
 *
 * Reglas:
 *  - Usuario y contraseña (Argon2id); bloqueo tras N intentos fallidos (5 por defecto).
 *  - El personal solo entra desde la red de la oficina y desde un equipo registrado y aprobado.
 *  - El administrador puede entrar desde fuera; siempre con doble factor (TOTP).
 *  - Una sola sesión activa por usuario; cierre por inactividad y duración máxima.
 *  - Desactivar un equipo o un usuario cierra al instante sus sesiones (se valida en cada petición).
 *  - Cookies HttpOnly, Secure (producción) y SameSite=Strict; en la base solo se guarda la huella HMAC del token.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Rol } from '@prisma/client';
import { db } from './db';
import { firmarToken, huellaToken, tokenAleatorio, verificarTokenFirmado } from './seguridad/cifrado';
import { hashContrasena, verificarContrasena } from './seguridad/contrasenas';
import { ipCliente, ipPermitida, agenteUsuario } from './seguridad/red';
import { consumirLimite } from './seguridad/limites';
import { obtenerConfig } from './configuracion';
import { auditar, alertar } from './auditoria';

const PRODUCCION = process.env.NODE_ENV === 'production';
// El prefijo __Host- obliga a Secure, Path=/ y sin Domain (solo en HTTPS)
export const COOKIE_SESION = PRODUCCION ? '__Host-sesion' : 'sesion';
export const COOKIE_DISPOSITIVO = PRODUCCION ? '__Host-dispositivo' : 'dispositivo';

export type { SesionActiva } from './sesion-tipos';
export { datosAuditoria } from './sesion-tipos';
import type { SesionActiva } from './sesion-tipos';

const opcionesCookie = (maxAgeSegundos: number) => ({
  httpOnly: true, secure: PRODUCCION, sameSite: 'strict' as const, path: '/', maxAge: maxAgeSegundos,
});

// Hash ficticio para igualar el tiempo de respuesta cuando el usuario no existe
let hashFicticio: Promise<string> | undefined;

async function dispositivoActual() {
  const token = verificarTokenFirmado((await cookies()).get(COOKIE_DISPOSITIVO)?.value);
  if (!token) return null;
  return db.dispositivo.findUnique({ where: { tokenHash: huellaToken(token) } });
}

async function fueraDeHorario(): Promise<boolean> {
  const h = await obtenerConfig('acceso.horario');
  if (!h.activo) return false;
  const ahora = new Date();
  const hhmm = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  return !h.dias.includes(ahora.getDay()) || hhmm < h.desde || hhmm > h.hasta;
}

export type ResultadoIngreso =
  | { ok: true; siguiente: string }
  | { ok: false; error: string; registrarEquipo?: boolean };

export async function iniciarSesion(usuarioTxt: string, contrasena: string, huella: string | null): Promise<ResultadoIngreso> {
  const ip = await ipCliente();
  const agente = await agenteUsuario();
  const usuarioNorm = usuarioTxt.trim().toLowerCase();
  const generico: ResultadoIngreso = { ok: false, error: 'Usuario o contraseña incorrectos.' };

  if (!(await consumirLimite(`ingreso:ip:${ip}`, 20, 900)).permitido || !(await consumirLimite(`ingreso:usuario:${usuarioNorm}`, 10, 900)).permitido) {
    await alertar('LIMITE_INTENTOS', 'MEDIA', `Demasiados intentos de ingreso desde ${ip}.`, { ip, usuario: usuarioNorm });
    return { ok: false, error: 'Demasiados intentos. Espere 15 minutos.' };
  }

  const u = await db.usuario.findUnique({ where: { usuario: usuarioNorm } });
  if (!u) {
    hashFicticio ??= hashContrasena('contrasena-ficticia-para-tiempo-constante');
    await verificarContrasena(await hashFicticio, contrasena);
    await auditar({ accion: 'INGRESO_FALLIDO', ip, detalle: { usuario: usuarioNorm, motivo: 'usuario inexistente' } });
    return generico;
  }
  if (u.bloqueadoHasta && u.bloqueadoHasta > new Date()) {
    await auditar({ accion: 'INGRESO_BLOQUEADO', usuarioId: u.id, usuarioNombre: u.usuario, ip });
    return { ok: false, error: 'La cuenta está bloqueada temporalmente por intentos fallidos. Contacte al administrador.' };
  }
  if (!(await verificarContrasena(u.hashContrasena, contrasena))) {
    const maximo = await obtenerConfig('acceso.intentos_maximos');
    const intentos = u.intentosFallidos + 1;
    const bloquear = intentos >= maximo;
    const minutos = await obtenerConfig('acceso.bloqueo_minutos');
    await db.usuario.update({
      where: { id: u.id },
      data: { intentosFallidos: bloquear ? 0 : intentos, bloqueadoHasta: bloquear ? new Date(Date.now() + minutos * 60_000) : u.bloqueadoHasta },
    });
    await auditar({ accion: bloquear ? 'USUARIO_BLOQUEADO' : 'INGRESO_FALLIDO', usuarioId: u.id, usuarioNombre: u.usuario, ip, detalle: { intentos } });
    if (bloquear) await alertar('BLOQUEO_USUARIO', 'ALTA', `La cuenta ${u.usuario} se bloqueó tras ${maximo} intentos fallidos.`, { ip });
    return generico;
  }
  if (u.estado !== 'ACTIVO') {
    await auditar({ accion: 'INGRESO_RECHAZADO', usuarioId: u.id, usuarioNombre: u.usuario, ip, detalle: { motivo: 'usuario suspendido' } });
    return { ok: false, error: 'La cuenta está suspendida. Contacte al administrador.' };
  }

  const esAdmin = u.rol === 'ADMINISTRADOR';
  const enOficina = ipPermitida(ip, await obtenerConfig('red.ips_oficina'));
  if (!enOficina && !esAdmin) {
    await alertar('IP_NO_PERMITIDA', 'ALTA', `Intento de ingreso de ${u.usuario} desde una red no autorizada (${ip}).`, { ip });
    await auditar({ accion: 'INGRESO_RECHAZADO', usuarioId: u.id, usuarioNombre: u.usuario, ip, detalle: { motivo: 'red no autorizada' } });
    return { ok: false, error: 'Solo se puede ingresar desde la red de la oficina.' };
  }
  if (!esAdmin && (await fueraDeHorario())) {
    await auditar({ accion: 'INGRESO_RECHAZADO', usuarioId: u.id, usuarioNombre: u.usuario, ip, detalle: { motivo: 'fuera de horario' } });
    return { ok: false, error: 'Fuera del horario permitido de acceso.' };
  }

  const disp = await dispositivoActual();
  if (!esAdmin && disp?.estado !== 'APROBADO') {
    await alertar('DISPOSITIVO_NO_AUTORIZADO', 'ALTA', `Intento de ingreso de ${u.usuario} desde un equipo ${disp ? (disp.estado === 'PENDIENTE' ? 'pendiente de aprobación' : 'revocado') : 'no registrado'}.`, { ip, dispositivoId: disp?.id });
    await auditar({ accion: 'INGRESO_RECHAZADO', usuarioId: u.id, usuarioNombre: u.usuario, ip, dispositivoId: disp?.id, detalle: { motivo: 'equipo no autorizado' } });
    return disp?.estado === 'PENDIENTE'
      ? { ok: false, error: 'Este equipo está pendiente de aprobación por el administrador.' }
      : { ok: false, error: 'Este equipo no está autorizado.', registrarEquipo: !disp };
  }
  if (disp && huella && disp.huella && disp.huella !== huella) {
    await alertar('HUELLA_DISTINTA', 'MEDIA', `La huella del navegador del equipo "${disp.nombre}" cambió (usuario ${u.usuario}).`, { ip, dispositivoId: disp.id });
  }

  // Sesión única: se cierran las demás sesiones del usuario
  await db.sesion.updateMany({ where: { usuarioId: u.id, revocadaEn: null }, data: { revocadaEn: new Date(), motivoRevocacion: 'nuevo inicio de sesión' } });
  const token = tokenAleatorio();
  const horas = await obtenerConfig('sesion.duracion_maxima_horas');
  const sesion = await db.sesion.create({
    data: {
      tokenHash: huellaToken(token), usuarioId: u.id, dispositivoId: disp?.estado === 'APROBADO' ? disp.id : null,
      ip, agenteUsuario: agente, remota: !enOficina, segundoFactorOk: false, expiraEn: new Date(Date.now() + horas * 3_600_000),
    },
  });
  await db.usuario.update({ where: { id: u.id }, data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: new Date() } });
  if (disp?.estado === 'APROBADO') await db.dispositivo.update({ where: { id: disp.id }, data: { ultimoAcceso: new Date() } });
  (await cookies()).set(COOKIE_SESION, firmarToken(token), opcionesCookie(horas * 3600));
  await auditar({ accion: 'SESION_INICIADA', usuarioId: u.id, usuarioNombre: u.usuario, ip, dispositivoId: disp?.id, entidad: 'sesion', entidadId: sesion.id, detalle: { remota: !enOficina } });
  if (!enOficina) await alertar('ACCESO_REMOTO', 'MEDIA', `El administrador ${u.usuario} inició sesión desde fuera de la oficina (${ip}).`, { ip });

  if (esAdmin) return { ok: true, siguiente: u.totpActivo ? '/verificacion' : '/configurar-2fa' };
  return { ok: true, siguiente: u.debeCambiarContrasena ? '/cambiar-contrasena' : '/' };
}

/** Lee y valida la sesión de la petición actual (sin redirigir) */
export async function leerSesion(): Promise<SesionActiva | null> {
  const token = verificarTokenFirmado((await cookies()).get(COOKIE_SESION)?.value);
  if (!token) return null;
  const s = await db.sesion.findUnique({ where: { tokenHash: huellaToken(token) }, include: { usuario: true, dispositivo: true } });
  if (!s || s.revocadaEn) return null;
  const ahora = Date.now();
  const inactividad = (await obtenerConfig('sesion.inactividad_minutos')) * 60_000;
  const revocar = async (motivo: string) => {
    await db.sesion.update({ where: { id: s.id }, data: { revocadaEn: new Date(), motivoRevocacion: motivo } });
    await auditar({ accion: 'SESION_CERRADA', usuarioId: s.usuarioId, usuarioNombre: s.usuario.usuario, entidad: 'sesion', entidadId: s.id, detalle: { motivo } });
    return null;
  };
  if (s.expiraEn.getTime() < ahora) return revocar('duración máxima');
  if (s.ultimaActividad.getTime() + inactividad < ahora) return revocar('inactividad');
  if (s.usuario.estado !== 'ACTIVO') return revocar('usuario suspendido');
  if (s.usuario.bloqueadoHasta && s.usuario.bloqueadoHasta.getTime() > ahora) return revocar('usuario bloqueado');
  if (s.dispositivoId && s.dispositivo?.estado !== 'APROBADO') return revocar('equipo desactivado');
  const ip = await ipCliente();
  if (s.usuario.rol !== 'ADMINISTRADOR' && !ipPermitida(ip, await obtenerConfig('red.ips_oficina'))) return revocar('cambio a una red no autorizada');
  if (ahora - s.ultimaActividad.getTime() > 60_000) {
    await db.sesion.update({ where: { id: s.id }, data: { ultimaActividad: new Date() } });
  }
  return {
    sesionId: s.id,
    usuario: { id: s.usuario.id, usuario: s.usuario.usuario, nombre: s.usuario.nombreCompleto, rol: s.usuario.rol, debeCambiarContrasena: s.usuario.debeCambiarContrasena, totpActivo: s.usuario.totpActivo },
    dispositivoId: s.dispositivoId, remota: s.remota, segundoFactorOk: s.segundoFactorOk, ip,
  };
}

/**
 * Exige sesión completa (y rol, si se indica). Redirige al paso pendiente:
 * ingreso → doble factor (administrador) → cambio de contraseña inicial.
 */
export async function requerirSesion(opciones: { roles?: Rol[]; paso?: 'verificacion' | 'cambiar-contrasena' | 'configurar-2fa' } = {}): Promise<SesionActiva> {
  const s = await leerSesion();
  if (!s) redirect('/ingreso');
  if (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk && opciones.paso !== 'verificacion' && opciones.paso !== 'configurar-2fa') {
    redirect(s.usuario.totpActivo ? '/verificacion' : '/configurar-2fa');
  }
  if (s.usuario.debeCambiarContrasena && (s.usuario.rol !== 'ADMINISTRADOR' || s.segundoFactorOk) && !opciones.paso) redirect('/cambiar-contrasena');
  if (opciones.roles && !opciones.roles.includes(s.usuario.rol)) redirect('/?error=permiso');
  return s;
}

export async function cerrarSesionActual(): Promise<void> {
  const s = await leerSesion();
  if (s) {
    await db.sesion.update({ where: { id: s.sesionId }, data: { revocadaEn: new Date(), motivoRevocacion: 'cierre por el usuario' } });
    await auditar({ accion: 'SESION_CERRADA', usuarioId: s.usuario.id, usuarioNombre: s.usuario.usuario, ip: s.ip, entidad: 'sesion', entidadId: s.sesionId, detalle: { motivo: 'cierre por el usuario' } });
  }
  (await cookies()).delete(COOKIE_SESION);
}

/** Registra este equipo (queda PENDIENTE hasta que el administrador lo apruebe) */
export async function registrarDispositivo(nombre: string, huella: string | null): Promise<{ ok: boolean; error?: string }> {
  const ip = await ipCliente();
  if (!(await consumirLimite(`registro-equipo:${ip}`, 5, 3600)).permitido) return { ok: false, error: 'Demasiadas solicitudes de registro desde esta red.' };
  if (!ipPermitida(ip, await obtenerConfig('red.ips_oficina'))) {
    await alertar('REGISTRO_EQUIPO_FUERA', 'ALTA', `Intento de registrar un equipo desde una red no autorizada (${ip}).`, { ip });
    return { ok: false, error: 'Los equipos solo se pueden registrar desde la red de la oficina.' };
  }
  const existente = await dispositivoActual();
  if (existente && existente.estado !== 'REVOCADO') return { ok: false, error: `Este equipo ya está registrado como "${existente.nombre}" (${existente.estado === 'APROBADO' ? 'aprobado' : 'pendiente de aprobación'}).` };
  const token = tokenAleatorio();
  const d = await db.dispositivo.create({ data: { nombre: nombre.trim().slice(0, 80), tokenHash: huellaToken(token), huella, ipRegistro: ip, agenteUsuario: await agenteUsuario() } });
  (await cookies()).set(COOKIE_DISPOSITIVO, firmarToken(token), opcionesCookie(400 * 24 * 3600));
  await alertar('EQUIPO_PENDIENTE', 'BAJA', `Nuevo equipo pendiente de aprobación: "${d.nombre}".`, { ip, dispositivoId: d.id });
  await auditar({ accion: 'EQUIPO_REGISTRADO', ip, dispositivoId: d.id, entidad: 'dispositivo', entidadId: d.id, detalle: { nombre: d.nombre } });
  return { ok: true };
}

