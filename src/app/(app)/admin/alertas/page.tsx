import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { accionAlerta } from '../acciones';
import { FormAdmin } from '../formularios';
import { fecha } from '../../componentes';

export default async function Alertas({ searchParams }: { searchParams: Promise<{ todas?: string }> }) {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const { todas } = await searchParams;
  const alertas = await db.alerta.findMany({ where: todas ? {} : { atendida: false }, orderBy: { creadaEn: 'desc' }, take: 300 });
  return (
    <>
      <div className="fila entre">
        <h1>Alertas de seguridad</h1>
        <div className="fila">
          <a className="boton secundario pequeno" href={todas ? '/admin/alertas' : '/admin/alertas?todas=1'}>{todas ? 'Ver solo pendientes' : 'Ver todas'}</a>
          {!todas && alertas.length > 0 && <FormAdmin accion={accionAlerta} ocultos={{ id: 'todas' }} botones={[{ texto: 'Marcar todas como atendidas', clase: 'secundario' }]} />}
        </div>
      </div>
      <p className="suave">Accesos desde equipos no autorizados o redes externas, bloqueos de cuentas, intentos repetidos, accesos remotos del administrador y equipos pendientes de aprobación.</p>
      <table>
        <thead><tr><th>Fecha</th><th>Severidad</th><th>Tipo</th><th>Mensaje</th><th></th></tr></thead>
        <tbody>{alertas.map((a) => (
          <tr key={a.id}>
            <td>{fecha(a.creadaEn)}</td>
            <td><span className={`etiqueta ${a.severidad === 'ALTA' ? 'critica' : a.severidad === 'MEDIA' ? 'advertencia' : 'informativa'}`}>{a.severidad.toLowerCase()}</span></td>
            <td>{a.tipo.replace(/_/g, ' ').toLowerCase()}</td>
            <td>{a.mensaje}</td>
            <td>{a.atendida ? <span className="etiqueta ok">atendida</span> : <FormAdmin accion={accionAlerta} ocultos={{ id: a.id }} botones={[{ texto: 'Atendida', clase: 'secundario' }]} />}</td>
          </tr>
        ))}</tbody>
      </table>
      {!alertas.length && <p className="suave">No hay alertas.</p>}
    </>
  );
}
