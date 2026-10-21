'use server';
/**
 * Acciones de acceso: ingreso, doble factor, cambio de contraseña, registro de equipo,
 * instalación del primer administrador y cierre de sesión.
 * Las acciones de servidor de Next verifican el origen de la petición (protección CSRF)
 * y las cookies son SameSite=Strict.
 */
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { iniciarSesion, leerSesion, registrarDispositivo, cerrarSesionActual } from '@/lib/sesion';
import { verificarCodigo } from '@/lib/seguridad/totp';
import { hashContrasena, politicaContrasena, verificarContrasena } from '@/lib/seguridad/contrasenas';
import { consumirLimite } from '@/lib/seguridad/limites';
import { ipCliente, ipPermitida } from '@/lib/seguridad/red';
import { obtenerConfig } from '@/lib/configuracion';
import { auditar, alertar } from '@/lib/auditoria';

export interface Estado { error?: string; ok?: string; registrarEquipo?: boolean }

const texto = (f: FormData, k: string) => String(f.get(k) ?? '');

export async function accionIngresar(_: Estado, f: FormData): Promise<Estado> {
  const r = await iniciarSesion(texto(f, 'usuario'), texto(f, 'contrasena'), texto(f, 'huella') || null);
  if (!r.ok) return { error: r.error, registrarEquipo: r.registrarEquipo };
  redirect(r.siguiente);
}

export async function accionVerificar(_: Estado, f: FormData): Promise<Estado> {
  const s = await leerSesion();
  if (!s) redirect('/ingreso');
  if (!(await consumirLimite(`totp:${s.sesionId}`, 5, 300)).permitido) {
    await db.sesion.update({ where: { id: s.sesionId }, data: { revocadaEn: new Date(), motivoRevocacion: 'demasiados códigos de doble factor errados' } });
    await alertar('DOBLE_FACTOR_FALLIDO', 'ALTA', `Demasiados códigos errados de doble factor para ${s.usuario.usuario}. Se cerró la sesión.`, { ip: s.ip });
    redirect('/ingreso');
  }
  const u = await db.usuario.findUniqueOrThrow({ where: { id: s.usuario.id } });
  if (!u.totpActivo || !u.totpSecretoCifrado) redirect('/configurar-2fa');
  const huella = await verificarCodigo(u.totpSecretoCifrado, texto(f, 'codigo'), u.totpUltimoCodigoHash);
  if (!huella) {
    await auditar({ accion: 'DOBLE_FACTOR_FALLIDO', usuarioId: u.id, usuarioNombre: u.usuario, ip: s.ip });
    return { error: 'Código incorrecto o ya utilizado.' };
  }
  await db.$transaction([
    db.usuario.update({ where: { id: u.id }, data: { totpUltimoCodigoHash: huella } }),
    db.sesion.update({ where: { id: s.sesionId }, data: { segundoFactorOk: true } }),
  ]);
  await auditar({ accion: 'DOBLE_FACTOR_VERIFICADO', usuarioId: u.id, usuarioNombre: u.usuario, ip: s.ip, entidad: 'sesion', entidadId: s.sesionId });
  redirect(u.debeCambiarContrasena ? '/cambiar-contrasena' : '/');
}

export async function accionConfirmar2FA(_: Estado, f: FormData): Promise<Estado> {
  const s = await leerSesion();
  if (!s) redirect('/ingreso');
  const u = await db.usuario.findUniqueOrThrow({ where: { id: s.usuario.id } });
  if (u.totpActivo) redirect('/verificacion'); // ya configurado: solo se puede verificar
  if (s.remota) return { error: 'El doble factor solo se puede configurar por primera vez desde la red de la oficina.' };
  if (!u.totpSecretoCifrado) return { error: 'Recargue la página para generar el código QR.' };
  if (!(await consumirLimite(`totp:${s.sesionId}`, 5, 300)).permitido) return { error: 'Demasiados intentos. Espere unos minutos.' };
  const huella = await verificarCodigo(u.totpSecretoCifrado, texto(f, 'codigo'));
  if (!huella) return { error: 'El código no coincide. Verifique la hora del teléfono e intente de nuevo.' };
  await db.$transaction([
    db.usuario.update({ where: { id: u.id }, data: { totpActivo: true, totpUltimoCodigoHash: huella } }),
    db.sesion.update({ where: { id: s.sesionId }, data: { segundoFactorOk: true } }),
  ]);
  await auditar({ accion: 'DOBLE_FACTOR_CONFIGURADO', usuarioId: u.id, usuarioNombre: u.usuario, ip: s.ip });
  redirect(u.debeCambiarContrasena ? '/cambiar-contrasena' : '/');
}

export async function accionCambiarContrasena(_: Estado, f: FormData): Promise<Estado> {
  const s = await leerSesion();
  if (!s) redirect('/ingreso');
  if (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk) redirect('/verificacion');
  const u = await db.usuario.findUniqueOrThrow({ where: { id: s.usuario.id } });
  if (!(await verificarContrasena(u.hashContrasena, texto(f, 'actual')))) return { error: 'La contraseña actual no es correcta.' };
  const nueva = texto(f, 'nueva');
  if (nueva !== texto(f, 'confirmacion')) return { error: 'La confirmación no coincide.' };
  const errores = politicaContrasena(nueva, u.usuario);
  if (errores.length) return { error: errores.join(' ') };
  if (await verificarContrasena(u.hashContrasena, nueva)) return { error: 'La nueva contraseña debe ser distinta de la actual.' };
  await db.usuario.update({ where: { id: u.id }, data: { hashContrasena: await hashContrasena(nueva), debeCambiarContrasena: false } });
  // Por seguridad se cierran las demás sesiones del usuario
  await db.sesion.updateMany({ where: { usuarioId: u.id, revocadaEn: null, id: { not: s.sesionId } }, data: { revocadaEn: new Date(), motivoRevocacion: 'cambio de contraseña' } });
  await auditar({ accion: 'CONTRASENA_CAMBIADA', usuarioId: u.id, usuarioNombre: u.usuario, ip: s.ip });
  redirect('/');
}

export async function accionRegistrarEquipo(_: Estado, f: FormData): Promise<Estado> {
  const nombre = texto(f, 'nombre').trim();
  if (nombre.length < 3) return { error: 'Escriba un nombre que identifique el equipo (p. ej. "Recepción – equipo 2").' };
  const r = await registrarDispositivo(nombre, texto(f, 'huella') || null);
  if (!r.ok) return { error: r.error };
  return { ok: 'Equipo registrado. Queda pendiente hasta que el administrador lo apruebe.' };
}

/** Crea el primer administrador. Solo funciona mientras no exista ningún usuario y desde la red de la oficina. */
export async function accionInstalar(_: Estado, f: FormData): Promise<Estado> {
  const ip = await ipCliente();
  if (!ipPermitida(ip, await obtenerConfig('red.ips_oficina'))) return { error: 'La instalación solo se puede hacer desde la red de la oficina.' };
  const usuario = texto(f, 'usuario').trim().toLowerCase();
  const nombre = texto(f, 'nombre').trim();
  const contrasena = texto(f, 'contrasena');
  if (!/^[a-z0-9._-]{4,30}$/.test(usuario)) return { error: 'Usuario: entre 4 y 30 caracteres (letras minúsculas, números, punto, guion).' };
  if (nombre.length < 5) return { error: 'Escriba el nombre completo.' };
  if (contrasena !== texto(f, 'confirmacion')) return { error: 'La confirmación no coincide.' };
  const errores = politicaContrasena(contrasena, usuario);
  if (errores.length) return { error: errores.join(' ') };
  const hash = await hashContrasena(contrasena);
  const creado = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(737373)`;
    if (await tx.usuario.count()) return null;
    return tx.usuario.create({ data: { usuario, nombreCompleto: nombre, hashContrasena: hash, rol: 'ADMINISTRADOR', debeCambiarContrasena: false } });
  });
  if (!creado) return { error: 'La aplicación ya fue instalada.' };
  await auditar({ accion: 'INSTALACION_ADMINISTRADOR', usuarioId: creado.id, usuarioNombre: creado.usuario, ip });
  redirect('/ingreso?instalado=1');
}

export async function accionCerrarSesion(): Promise<void> {
  await cerrarSesionActual();
  redirect('/ingreso');
}
