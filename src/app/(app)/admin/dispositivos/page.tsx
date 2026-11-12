import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { accionDispositivo } from '../acciones';
import { FormAdmin } from '../formularios';
import { Tabla, Vacio, fecha, hace } from '../../componentes';
import { Icono } from '../../../Icono';

const ESTADO: Record<string, { clase: string; texto: string }> = {
  PENDIENTE: { clase: 'advertencia', texto: 'Pendiente' },
  APROBADO: { clase: 'ok', texto: 'Aprobado' },
  REVOCADO: { clase: 'critica', texto: 'Desactivado' },
};

export const metadata = { title: 'Dispositivos' };

export default async function Dispositivos() {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const equipos = await db.dispositivo.findMany({ orderBy: [{ estado: 'asc' }, { creadoEn: 'desc' }], include: { aprobadoPor: { select: { nombreCompleto: true } }, _count: { select: { sesiones: { where: { revocadaEn: null } } } } } });
  const pendientes = equipos.filter((d) => d.estado === 'PENDIENTE').length;
  return (
    <>
      <div className="encabezado">
        <h1>Dispositivos</h1>
        <p className="suave">Cada computador de la oficina se registra una vez (cookie firmada HttpOnly/Secure/SameSite=Strict; en la base solo se guarda su huella HMAC). Desactivar un equipo cierra al instante todas sus sesiones.</p>
      </div>
      {pendientes > 0 && <div className="aviso alerta"><Icono nombre="equipo" /><div>{pendientes} equipo(s) esperan su aprobación. Apruebe solo los que reconozca.</div></div>}
      {!equipos.length ? (
        <section className="tarjeta"><Vacio icono="equipo" titulo="No hay equipos registrados"><p>Desde cada computador de la oficina use «Registrar este equipo» en la pantalla de ingreso; luego apruébelo aquí.</p></Vacio></section>
      ) : (
        <Tabla fija etiqueta="Equipos registrados">
          <thead><tr><th>Equipo</th><th>Estado</th><th>Registro</th><th>Último acceso</th><th className="numero">Sesiones</th><th>Acciones</th></tr></thead>
          <tbody>{equipos.map((d) => {
            const est = ESTADO[d.estado] ?? { clase: '', texto: d.estado.toLowerCase() };
            return (
              <tr key={d.id}>
                <td className="principal-celda"><strong>{d.nombre}</strong><div className="tenue">{d.agenteUsuario?.slice(0, 60)}</div></td>
                <td data-etiqueta="Estado"><span className={`etiqueta ${est.clase}`}>{est.texto}</span>{d.aprobadoPor && <div className="tenue">por {d.aprobadoPor.nombreCompleto}</div>}</td>
                <td data-etiqueta="Registro" className="suave">{fecha(d.creadoEn)}<div className="tenue">IP {d.ipRegistro}</div></td>
                <td data-etiqueta="Último acceso" className="suave" title={fecha(d.ultimoAcceso)}>{hace(d.ultimoAcceso)}</td>
                <td data-etiqueta="Sesiones" className="numero">{d._count.sesiones}</td>
                <td className="acciones">
                  <FormAdmin accion={accionDispositivo} ocultos={{ id: d.id }}
                    botones={[
                      ...(d.estado !== 'APROBADO' ? [{ operacion: 'aprobar', texto: 'Aprobar', clase: 'exito' }] : []),
                      ...(d.estado === 'APROBADO' ? [{ operacion: 'revocar', texto: 'Desactivar', clase: 'peligro-suave' }] : []),
                      { operacion: 'eliminar', texto: 'Eliminar', clase: 'secundario' },
                    ]}
                    confirmar={{ revocar: '¿Desactivar el equipo? Se cerrarán sus sesiones de inmediato.', eliminar: '¿Eliminar el registro del equipo? Tendrá que registrarse de nuevo desde su navegador.' }} />
                </td>
              </tr>
            );
          })}</tbody>
        </Tabla>
      )}
      <p className="tenue mt">Mejora opcional documentada: autenticación por certificado de cliente (mTLS) en el proxy para un control de equipos más fuerte (ver docs/seguridad.md).</p>
    </>
  );
}
