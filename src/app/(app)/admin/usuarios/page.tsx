import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { accionCrearUsuario, accionUsuario } from '../acciones';
import { FormAdmin } from '../formularios';
import { fecha } from '../../componentes';

const ROLES: [string, string][] = [['DIGITADOR', 'Digitador / auxiliar'], ['REVISOR', 'Revisor'], ['ADMINISTRADOR', 'Administrador']];

export default async function Usuarios() {
  const s = await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const usuarios = await db.usuario.findMany({ orderBy: [{ estado: 'asc' }, { nombreCompleto: 'asc' }], include: { _count: { select: { sesiones: { where: { revocadaEn: null, expiraEn: { gt: new Date() } } } } } } });
  return (
    <>
      <h1>Usuarios</h1>
      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Crear usuario</h2>
        <FormAdmin accion={accionCrearUsuario} campos={[
          { nombre: 'nombre', etiqueta: 'Nombre completo' },
          { nombre: 'usuario', etiqueta: 'Usuario', ayuda: 'Minúsculas, sin espacios.' },
          { nombre: 'correo', etiqueta: 'Correo (opcional)' },
          { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', opciones: ROLES },
        ]} botones={[{ texto: 'Crear con contraseña temporal' }]} />
      </section>
      <table>
        <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Doble factor</th><th>Último acceso</th><th>Acciones</th></tr></thead>
        <tbody>{usuarios.map((u) => {
          const bloqueado = u.bloqueadoHasta && u.bloqueadoHasta > new Date();
          const propio = u.id === s.usuario.id;
          return (
            <tr key={u.id}>
              <td><strong>{u.nombreCompleto}</strong><div className="suave">{u.usuario}{u.debeCambiarContrasena ? ' · debe cambiar contraseña' : ''}</div></td>
              <td>{ROLES.find(([k]) => k === u.rol)?.[1]}</td>
              <td><span className={`etiqueta ${u.estado === 'ACTIVO' ? 'ok' : 'critica'}`}>{u.estado.toLowerCase()}</span>{bloqueado && <div><span className="etiqueta critica">bloqueado</span></div>}</td>
              <td>{u.totpActivo ? 'Activo' : u.rol === 'ADMINISTRADOR' ? 'Pendiente' : '—'}</td>
              <td className="suave">{fecha(u.ultimoAcceso)}<br />{u._count.sesiones} sesión(es)</td>
              <td>
                <details><summary>Gestionar</summary>
                  <FormAdmin accion={accionUsuario} ocultos={{ id: u.id }} campos={propio ? [] : [{ nombre: 'rol', etiqueta: 'Rol', tipo: 'select', opciones: ROLES, valor: u.rol }]}
                    botones={[
                      ...(!propio ? [{ operacion: 'rol', texto: 'Cambiar rol', clase: 'secundario' }] : []),
                      ...(bloqueado ? [{ operacion: 'desbloquear', texto: 'Desbloquear', clase: 'exito' }] : []),
                      ...(!propio && u.estado === 'ACTIVO' ? [{ operacion: 'suspender', texto: 'Suspender', clase: 'peligro' }] : []),
                      ...(u.estado !== 'ACTIVO' ? [{ operacion: 'activar', texto: 'Activar', clase: 'exito' }] : []),
                      { operacion: 'restablecer', texto: 'Restablecer contraseña', clase: 'secundario' },
                      ...(u.totpActivo ? [{ operacion: 'restablecer_2fa', texto: 'Restablecer doble factor', clase: 'secundario' }] : []),
                      { operacion: 'cerrar_sesiones', texto: 'Cerrar sesiones', clase: 'secundario' },
                      ...(!propio ? [{ operacion: 'eliminar', texto: 'Eliminar', clase: 'peligro' }] : []),
                    ]}
                    confirmar={{ suspender: '¿Suspender al usuario? Se cerrarán sus sesiones.', eliminar: '¿Eliminar definitivamente al usuario?', restablecer: '¿Generar una nueva contraseña temporal?', restablecer_2fa: '¿Restablecer el doble factor? Deberá configurarlo de nuevo desde la oficina.' }} />
                </details>
              </td>
            </tr>
          );
        })}</tbody>
      </table>
    </>
  );
}
