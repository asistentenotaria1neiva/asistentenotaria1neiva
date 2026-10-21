import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { accionAlerta } from '../acciones';
import { FormAdmin } from '../formularios';
import { Tabla, fecha } from '../../componentes';

export default async function Alertas({ searchParams }: { searchParams: Promise<{ todas?: string }> }) {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const { todas } = await searchParams;
  const alertas = await db.alerta.findMany({ where: todas ? {} : { atendida: false }, orderBy: { creadaEn: 'desc' }, take: 300 });
  return (
    <>
      <div className="fila entre encabezado">
        <h1>Alertas de seguridad</h1>
        <div className="fila">
          <a className="boton secundario pequeno" href={todas ? '/admin/alertas' : '/admin/alertas?todas=1'}>{todas ? 'Ver solo pendientes' : 'Ver todas'}</a>
          {!todas && alertas.length > 0 && <FormAdmin accion={accionAlerta} ocultos={{ id: 'todas' }} botones={[{ texto: 'Marcar todas como atendidas', clase: 'secundario' }]} />}
        </div>
      </div>
      <p className="suave">Accesos desde equipos no autorizados o redes externas, bloqueos de cuentas, intentos repetidos, accesos remotos del administrador y equipos pendientes de aprobación.</p>
      {!alertas.length ? <p className="suave vacio tarjeta">No hay alertas{todas ? '' : ' pendientes'}.</p> : (
        <Tabla>
          <thead><tr><th>Mensaje</th><th>Severidad</th><th>Tipo</th><th>Fecha</th><th aria-label="Acciones" /></tr></thead>
          <tbody>{alertas.map((a) => (
            <tr key={a.id}>
              <td className="principal-celda">{a.mensaje}</td>
              <td data-etiqueta="Severidad"><span className={`etiqueta ${a.severidad === 'ALTA' ? 'critica' : a.severidad === 'MEDIA' ? 'advertencia' : 'informativa'}`}>{a.severidad.toLowerCase()}</span></td>
              <td data-etiqueta="Tipo">{a.tipo.replace(/_/g, ' ').toLowerCase()}</td>
              <td data-etiqueta="Fecha" className="suave" style={{ whiteSpace: 'nowrap' }}>{fecha(a.creadaEn)}</td>
              <td className="acciones">{a.atendida ? <span className="etiqueta ok">atendida</span> : <FormAdmin accion={accionAlerta} ocultos={{ id: a.id }} botones={[{ texto: 'Marcar atendida', clase: 'secundario' }]} />}</td>
            </tr>
          ))}</tbody>
        </Tabla>
      )}
    </>
  );
}
