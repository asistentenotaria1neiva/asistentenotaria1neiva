import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { Tabla, fecha } from '../componentes';

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
        <Link className="tarjeta" href="/admin/usuarios"><div className="suave">Usuarios activos</div><div className="cifra">{usuarios}</div><div className="suave">{sesiones} sesiones activas</div></Link>
        <Link className="tarjeta" href="/admin/dispositivos"><div className="suave">Equipos aprobados</div><div className="cifra">{equiposOk}</div><div className="suave">{equiposPend > 0 ? <span className="etiqueta advertencia">{equiposPend} pendientes</span> : 'ninguno pendiente'}</div></Link>
        <Link className="tarjeta" href="/admin/alertas"><div className="suave">Alertas sin atender</div><div className="cifra" style={alertas ? { color: 'var(--peligro)' } : undefined}>{alertas}</div><div className="suave">ver alertas de seguridad</div></Link>
        <Link className="tarjeta" href="/plantillas"><div className="suave">Plantillas por aprobar</div><div className="cifra">{plantillasPend}</div><div className="suave">{tiposSinPlantilla} tipos sin plantilla</div></Link>
      </div>
      <div className="rejilla dos">
        <section className="tarjeta">
          <h2>Expedientes por estado</h2>
          <Tabla apilable={false}><tbody>
            {[['BORRADOR', 'En elaboración'], ['DEVUELTO', 'Devueltos'], ['EN_REVISION', 'En revisión'], ['APROBADA', 'Listos para firma'], ['FIRMADA', 'Firmados'], ['ARCHIVADA', 'Archivados']].map(([k, v]) => (
              <tr key={k}><td><Link href={`/expedientes?estado=${k}`}>{v}</Link></td><td className="numero"><strong>{cuenta(k)}</strong></td></tr>
            ))}
          </tbody></Tabla>
        </section>
        <section className="tarjeta">
          <h2>Alertas recientes</h2>
          {!ultimasAlertas.length && <p className="suave">Sin alertas pendientes.</p>}
          <ul className="historial">{ultimasAlertas.map((a) => (
            <li key={a.id}>
              <span>{a.mensaje}</span>
              <span className={`etiqueta ${a.severidad === 'ALTA' ? 'critica' : a.severidad === 'MEDIA' ? 'advertencia' : 'informativa'}`}>{a.severidad.toLowerCase()}</span>
              <time className="suave">{fecha(a.creadaEn)}</time>
            </li>
          ))}</ul>
        </section>
      </div>
    </>
  );
}
