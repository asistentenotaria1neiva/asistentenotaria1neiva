import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { accionDispositivo } from '../acciones';
import { FormAdmin } from '../formularios';
import { Tabla, fecha } from '../../componentes';

const ESTADO: Record<string, string> = { PENDIENTE: 'advertencia', APROBADO: 'ok', REVOCADO: 'critica' };

export default async function Dispositivos() {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const equipos = await db.dispositivo.findMany({ orderBy: [{ estado: 'asc' }, { creadoEn: 'desc' }], include: { aprobadoPor: { select: { nombreCompleto: true } }, _count: { select: { sesiones: { where: { revocadaEn: null } } } } } });
  return (
    <>
      <h1>Dispositivos</h1>
      <p className="suave">Cada equipo de la oficina se registra una vez (cookie firmada HttpOnly/Secure/SameSite=Strict; en la base solo se guarda su huella HMAC). Desactivar un equipo cierra al instante todas sus sesiones.</p>
      {equipos.length > 0 && <Tabla>
        <thead><tr><th>Equipo</th><th>Estado</th><th>Registro</th><th>Último acceso</th><th className="numero">Sesiones</th><th>Acciones</th></tr></thead>
        <tbody>{equipos.map((d) => (
          <tr key={d.id}>
            <td className="principal-celda"><strong>{d.nombre}</strong><div className="suave" style={{ overflowWrap: 'anywhere' }}>{d.agenteUsuario?.slice(0, 60)}</div></td>
            <td data-etiqueta="Estado"><span><span className={`etiqueta ${ESTADO[d.estado]}`}>{d.estado.toLowerCase()}</span>{d.aprobadoPor && <span className="suave"> por {d.aprobadoPor.nombreCompleto}</span>}</span></td>
            <td data-etiqueta="Registro" className="suave">{fecha(d.creadoEn)}<br />IP {d.ipRegistro}</td>
            <td data-etiqueta="Último acceso" className="suave">{fecha(d.ultimoAcceso)}</td>
            <td data-etiqueta="Sesiones" className="numero">{d._count.sesiones}</td>
            <td className="acciones">
              <FormAdmin accion={accionDispositivo} ocultos={{ id: d.id }}
                botones={[
                  ...(d.estado !== 'APROBADO' ? [{ operacion: 'aprobar', texto: 'Aprobar', clase: 'exito' }] : []),
                  ...(d.estado === 'APROBADO' ? [{ operacion: 'revocar', texto: 'Desactivar', clase: 'peligro' }] : []),
                  { operacion: 'eliminar', texto: 'Eliminar', clase: 'secundario' },
                ]}
                confirmar={{ revocar: '¿Desactivar el equipo? Se cerrarán sus sesiones de inmediato.', eliminar: '¿Eliminar el registro del equipo?' }} />
            </td>
          </tr>
        ))}</tbody>
      </Tabla>}
      {!equipos.length && <p className="suave vacio tarjeta">No hay equipos registrados. Desde cada computador de la oficina use “Registrar este equipo” en la pantalla de ingreso.</p>}
      <div className="aviso info" style={{ marginTop: '1rem' }}>Mejora opcional documentada: autenticación por certificado de cliente (mTLS) en el proxy para un control de equipos más fuerte (ver docs/seguridad.md).</div>
    </>
  );
}
