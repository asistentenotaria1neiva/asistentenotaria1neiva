import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { fecha } from '../componentes';

export default async function PanelAdmin() {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const hace30 = new Date(Date.now() - 30 * 86_400_000);
  const [usuarios, equiposPend, equiposOk, alertas, plantillas, plantillasRevisor, escrituras, generadas30, sesiones, ultimasAlertas] = await Promise.all([
    db.usuario.count({ where: { estado: 'ACTIVO' } }),
    db.dispositivo.count({ where: { estado: 'PENDIENTE' } }),
    db.dispositivo.count({ where: { estado: 'APROBADO' } }),
    db.alerta.count({ where: { atendida: false } }),
    db.plantilla.count({ where: { activa: true } }),
    db.plantilla.count({ where: { activa: true, origen: 'REVISOR' } }),
    db.expediente.count(),
    db.generacion.count({ where: { estado: 'COMPLETADA', creadaEn: { gt: hace30 } } }),
    db.sesion.count({ where: { revocadaEn: null, expiraEn: { gt: new Date() }, ultimaActividad: { gt: new Date(Date.now() - 20 * 60_000) } } }),
    db.alerta.findMany({ where: { atendida: false, creadaEn: { gt: hace30 } }, orderBy: { creadaEn: 'desc' }, take: 5 }),
  ]);
  return (
    <>
      <h1>Panel del administrador</h1>
      <div className="rejilla cuatro">
        <Link className="tarjeta" href="/admin/usuarios"><div className="suave">Usuarios activos</div><div className="cifra">{usuarios}</div><div className="suave">{sesiones} sesiones activas</div></Link>
        <Link className="tarjeta" href="/admin/dispositivos"><div className="suave">Equipos aprobados</div><div className="cifra">{equiposOk}</div><div className="suave">{equiposPend > 0 ? <span className="etiqueta advertencia">{equiposPend} pendientes</span> : 'ninguno pendiente'}</div></Link>
        <Link className="tarjeta" href="/admin/alertas"><div className="suave">Alertas sin atender</div><div className="cifra" style={alertas ? { color: 'var(--peligro)' } : undefined}>{alertas}</div><div className="suave">ver alertas de seguridad</div></Link>
        <Link className="tarjeta" href="/plantillas"><div className="suave">Plantillas en la biblioteca</div><div className="cifra">{plantillas.toLocaleString('es-CO')}</div><div className="suave">{plantillasRevisor} agregadas por revisores</div></Link>
      </div>
      <div className="rejilla dos">
        <Link className="tarjeta" href="/expedientes"><div className="suave">Escrituras</div><div className="cifra">{escrituras}</div><div className="suave">{generadas30} versiones generadas en los últimos 30 días</div></Link>
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
