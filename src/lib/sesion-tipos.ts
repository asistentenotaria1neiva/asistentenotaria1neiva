/** Tipos de la sesión, sin dependencias de Next (los usan los servicios y los scripts) */
import type { Rol } from '@prisma/client';

export interface SesionActiva {
  sesionId: string;
  usuario: { id: string; usuario: string; nombre: string; rol: Rol; debeCambiarContrasena: boolean; totpActivo: boolean };
  dispositivoId: string | null;
  remota: boolean;
  segundoFactorOk: boolean;
  ip: string;
}

/** Datos del contexto para auditar acciones del usuario actual */
export const datosAuditoria = (s: SesionActiva) => ({ usuarioId: s.usuario.id, usuarioNombre: s.usuario.usuario, ip: s.ip, dispositivoId: s.dispositivoId });
