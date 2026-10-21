import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { accionCrearUsuario, accionUsuario } from '../acciones';
import { FormAdmin } from '../formularios';
import { Tabla, fecha } from '../../componentes';

const ROLES: [string, string][] = [['DIGITADOR', 'Digitador / auxiliar'], ['REVISOR', 'Revisor'], ['ADMINISTRADOR', 'Administrador']];

export default async function Usuarios() {
  const s = await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const usuarios = await db.usuario.findMany({ orderBy: [{ estado: 'asc' }, { nombreCompleto: 'asc' }], include: { _count: { select: { sesiones: { where: { revocadaEn: null, expiraEn: { gt: new Date() } } } } } } });
  return (
    <>
      <h1>Usuarios</h1>
      <section className="tarjeta">
        <h2>Crear usuario</h2>
        <FormAdmin accion={accionCrearUsuario} columnas campos={[
          { nombre: 'nombre', etiqueta: 'Nombre completo' },
          { nombre: 'usuario', etiqueta: 'Usuario', ayuda: 'Minúsculas, sin espacios.' },
          { nombre: 'correo', etiqueta: 'Correo (opcional)' },
          { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', opciones: ROLES },
        ]} botones={[{ texto: 'Crear con contraseña temporal' }]} />
      </section>
      <Tabla>
        <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Doble factor</th><th>Último acceso</th><th>Acciones</th></tr></thead>
        <tbody>{usuarios.map((u) => {
          const bloqueado = u.bloqueadoHasta && u.bloqueadoHasta > new Date();
          const propio = u.id === s.usuario.id;
          return (
            <tr key={u.id}>
              <td className="principal-celda"><strong>{u.nombreCompleto}</strong>{propio && <> <span className="etiqueta informativa">usted</span></>}<div className="suave">{u.usuario}{u.debeCambiarContrasena ? ' · debe cambiar contraseña' : ''}</div></td>
              <td data-etiqueta="Rol">{ROLES.find(([k]) => k === u.rol)?.[1]}</td>
              <td data-etiqueta="Estado"><span><span className={`etiqueta ${u.estado === 'ACTIVO' ? 'ok' : 'critica'}`}>{u.estado.toLowerCase()}</span>{bloqueado && <> <span className="etiqueta critica">bloqueado</span></>}</span></td>
              <td data-etiqueta="Doble factor">{u.totpActivo ? <span className="etiqueta ok">activo</span> : u.rol === 'ADMINISTRADOR' ? <span className="etiqueta advertencia">pendiente</span> : '—'}</td>
              <td data-etiqueta="Último acceso" className="suave">{fecha(u.ultimoAcceso)}<br />{u._count.sesiones} sesión(es)</td>
              <td className="acciones">
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
      </Tabla>
    </>
  );
}
