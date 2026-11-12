import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { accionCrearUsuario, accionUsuario } from '../acciones';
import { FormAdmin } from '../formularios';
import { Tabla, fecha, hace } from '../../componentes';
import { Icono } from '../../../Icono';

const ROLES: [string, string][] = [['DIGITADOR', 'Digitador / auxiliar'], ['REVISOR', 'Revisor'], ['ADMINISTRADOR', 'Administrador']];

export const metadata = { title: 'Usuarios' };

export default async function Usuarios() {
  const s = await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const usuarios = await db.usuario.findMany({ orderBy: [{ estado: 'asc' }, { nombreCompleto: 'asc' }], include: { _count: { select: { sesiones: { where: { revocadaEn: null, expiraEn: { gt: new Date() } } } } } } });
  return (
    <>
      <div className="encabezado">
        <h1>Usuarios</h1>
        <p className="suave">Prefiera suspender a eliminar: un usuario con escrituras no se puede eliminar, para conservar la trazabilidad.</p>
      </div>
      <details className="tarjeta carga-nueva">
        <summary><Icono nombre="mas" tamano={18} />Crear usuario</summary>
        <FormAdmin accion={accionCrearUsuario} columnas campos={[
          { nombre: 'nombre', etiqueta: 'Nombre completo' },
          { nombre: 'usuario', etiqueta: 'Usuario', ayuda: 'Minúsculas, sin espacios.' },
          { nombre: 'correo', etiqueta: 'Correo (opcional)' },
          { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', opciones: ROLES },
        ]} botones={[{ texto: 'Crear con contraseña temporal' }]} />
      </details>
      <Tabla fija etiqueta="Usuarios">
        <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Doble factor</th><th>Último acceso</th><th>Acciones</th></tr></thead>
        <tbody>{usuarios.map((u) => {
          const bloqueado = u.bloqueadoHasta && u.bloqueadoHasta > new Date();
          const propio = u.id === s.usuario.id;
          return (
            <tr key={u.id}>
              <td className="principal-celda"><strong>{u.nombreCompleto}</strong>{propio && <> <span className="etiqueta marca">Usted</span></>}<div className="tenue">{u.usuario}{u.debeCambiarContrasena ? ' · debe cambiar la contraseña' : ''}</div></td>
              <td data-etiqueta="Rol">{ROLES.find(([k]) => k === u.rol)?.[1]}</td>
              <td data-etiqueta="Estado"><span className="fila chica"><span className={`etiqueta ${u.estado === 'ACTIVO' ? 'ok' : 'critica'}`}>{u.estado === 'ACTIVO' ? 'Activo' : u.estado.charAt(0) + u.estado.slice(1).toLowerCase()}</span>{bloqueado && <span className="etiqueta critica">Bloqueado</span>}</span></td>
              <td data-etiqueta="Doble factor">{u.totpActivo ? <span className="etiqueta ok">Activo</span> : u.rol === 'ADMINISTRADOR' ? <span className="etiqueta advertencia">Pendiente</span> : <span className="tenue">—</span>}</td>
              <td data-etiqueta="Último acceso" className="suave"><span title={fecha(u.ultimoAcceso)}>{hace(u.ultimoAcceso)}</span><div className="tenue">{u._count.sesiones} sesión(es)</div></td>
              <td className="acciones">
                <details className="gestion simple"><summary>Gestionar</summary>
                  <FormAdmin accion={accionUsuario} ocultos={{ id: u.id }} campos={propio ? [] : [{ nombre: 'rol', etiqueta: 'Rol', tipo: 'select', opciones: ROLES, valor: u.rol }]}
                    botones={[
                      ...(!propio ? [{ operacion: 'rol', texto: 'Cambiar rol', clase: 'secundario' }] : []),
                      ...(bloqueado ? [{ operacion: 'desbloquear', texto: 'Desbloquear', clase: 'exito' }] : []),
                      ...(!propio && u.estado === 'ACTIVO' ? [{ operacion: 'suspender', texto: 'Suspender', clase: 'peligro-suave' }] : []),
                      ...(u.estado !== 'ACTIVO' ? [{ operacion: 'activar', texto: 'Activar', clase: 'exito' }] : []),
                      { operacion: 'restablecer', texto: 'Restablecer contraseña', clase: 'secundario' },
                      ...(u.totpActivo ? [{ operacion: 'restablecer_2fa', texto: 'Restablecer doble factor', clase: 'secundario' }] : []),
                      { operacion: 'cerrar_sesiones', texto: 'Cerrar sesiones', clase: 'secundario' },
                      ...(!propio ? [{ operacion: 'eliminar', texto: 'Eliminar', clase: 'peligro' }] : []),
                    ]}
                    confirmar={{ suspender: '¿Suspender al usuario? Se cerrarán sus sesiones.', eliminar: '¿Eliminar definitivamente al usuario? No se puede deshacer.', restablecer: '¿Generar una nueva contraseña temporal? La actual dejará de servir.', restablecer_2fa: '¿Restablecer el doble factor? Deberá configurarlo de nuevo desde la oficina.' }} />
                </details>
              </td>
            </tr>
          );
        })}</tbody>
      </Tabla>
    </>
  );
}
