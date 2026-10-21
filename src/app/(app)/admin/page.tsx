import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { fecha } from '../componentes';

export default async function PanelAdmin() {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const hace30 = new Date(Date.now() - 30 * 86_400_000);
  const [usuarios, equiposPend, equiposOk, alertas, expPorEstado, tiposSinPlantilla, plantillasPend, sesiones, ultimasAlertas] = await Promise.all([
    db.usuario.count({ where: { estado: 'ACTIVO' } }),
    db.dispositivo.count({ where: { estado: 'PENDIENTE' } }),
    db.dispositivo.count({ where: { estado: 'APROBADO' } }),
    db.alerta.count({ where: { atendida: false } }),
    db.expediente.groupBy({ by: ['estado'], _count: true }),
    db.tipoEscritura.count({ where: { esBloque: false, plantillas: { none: {} } } }),
    db.plantilla.count({ where: { estado: 'PENDIENTE_APROBACION' } }),
    db.sesion.count({ where: { revocadaEn: null, expiraEn: { gt: new Date() }, ultimaActividad: { gt: new Date(Date.now() - 20 * 60_000) } } }),
    db.alerta.findMany({ where: { atendida: false, creadaEn: { gt: hace30 } }, orderBy: { creadaEn: 'desc' }, take: 5 }),
  ]);
  const cuenta = (e: string) => expPorEstado.find((x) => x.estado === e)?._count ?? 0;
  return (
    <>
      <h1>Panel del administrador</h1>
      <div className="rejilla cuatro">
        <Link className="tarjeta" href="/admin/usuarios"><div className="cifra">{usuarios}</div><div className="suave">usuarios activos · {sesiones} sesiones activas</div></Link>
        <Link className="tarjeta" href="/admin/dispositivos"><div className="cifra">{equiposOk}</div><div className="suave">equipos aprobados · {equiposPend} pendientes</div></Link>
        <Link className="tarjeta" href="/admin/alertas"><div className="cifra">{alertas}</div><div className="suave">alertas sin atender</div></Link>
        <Link className="tarjeta" href="/admin/plantillas"><div className="cifra">{plantillasPend}</div><div className="suave">plantillas pendientes de aprobación · {tiposSinPlantilla} tipos sin plantilla</div></Link>
      </div>
      <div className="rejilla dos">
        <section className="tarjeta">
          <h2 style={{ marginTop: 0 }}>Expedientes</h2>
          <table><tbody>
            {[['BORRADOR', 'En elaboración'], ['DEVUELTO', 'Devueltos'], ['EN_REVISION', 'En revisión'], ['APROBADA', 'Listos para firma'], ['FIRMADA', 'Firmados'], ['ARCHIVADA', 'Archivados']].map(([k, v]) => (
              <tr key={k}><td>{v}</td><td><strong>{cuenta(k)}</strong></td></tr>
            ))}
          </tbody></table>
        </section>
        <section className="tarjeta">
          <h2 style={{ marginTop: 0 }}>Alertas recientes</h2>
          {!ultimasAlertas.length && <p className="suave">Sin alertas pendientes.</p>}
          <ul>{ultimasAlertas.map((a) => <li key={a.id}><span className={`etiqueta ${a.severidad === 'ALTA' ? 'critica' : a.severidad === 'MEDIA' ? 'advertencia' : 'informativa'}`}>{a.severidad}</span> {a.mensaje} <span className="suave">· {fecha(a.creadaEn)}</span></li>)}</ul>
        </section>
      </div>
    </>
  );
}
