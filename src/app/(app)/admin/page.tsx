import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { Vacio, fecha } from '../componentes';
import { Icono } from '../../Icono';

const SEVERIDAD: Record<string, string> = { ALTA: 'critica', MEDIA: 'advertencia' };

export const metadata = { title: 'Panel del administrador' };

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
      <div className="encabezado">
        <h1>Panel del administrador</h1>
        <p className="suave">Estado de la aplicación, los equipos y la seguridad.</p>
      </div>
      <div className="rejilla cuatro">
        <Link className="tarjeta compacta indicador" href="/admin/usuarios"><span className="rotulo"><Icono nombre="usuarios" tamano={16} />Usuarios activos</span><span className="cifra">{usuarios}</span><span className="tenue">{sesiones} en sesión ahora</span></Link>
        <Link className="tarjeta compacta indicador" href="/admin/dispositivos"><span className="rotulo"><Icono nombre="equipo" tamano={16} />Equipos aprobados</span><span className="cifra">{equiposOk}</span><span className="tenue">{equiposPend > 0 ? <span className="etiqueta advertencia">{equiposPend} pendiente(s)</span> : 'ninguno pendiente'}</span></Link>
        <Link className={`tarjeta compacta indicador${alertas ? ' con-alerta' : ''}`} href="/admin/alertas"><span className="rotulo"><Icono nombre="alerta" tamano={16} />Alertas sin atender</span><span className={`cifra${alertas ? ' peligro' : ''}`}>{alertas}</span><span className="tenue">alertas de seguridad</span></Link>
        <Link className="tarjeta compacta indicador" href="/plantillas"><span className="rotulo"><Icono nombre="biblioteca" tamano={16} />Plantillas</span><span className="cifra">{plantillas.toLocaleString('es-CO')}</span><span className="tenue">{plantillasRevisor} agregadas por revisores</span></Link>
      </div>
      <div className="rejilla dos">
        <section className="tarjeta">
          <div className="tarjeta-cabecera"><h2>Requiere su atención</h2></div>
          {!equiposPend && !alertas ? <Vacio icono="check" titulo="Nada pendiente"><p>No hay equipos por aprobar ni alertas sin atender.</p></Vacio> : (
            <div className="atencion">
              {alertas > 0 && <Link className="critica" href="/admin/alertas"><Icono nombre="alerta" />{alertas} alerta(s) de seguridad sin atender<Icono nombre="adelante" tamano={16} /></Link>}
              {equiposPend > 0 && <Link className="alerta" href="/admin/dispositivos"><Icono nombre="equipo" />{equiposPend} equipo(s) esperan aprobación<Icono nombre="adelante" tamano={16} /></Link>}
            </div>
          )}
          <hr />
          <Link className="indicador" href="/expedientes"><span className="rotulo"><Icono nombre="escrituras" tamano={16} />Escrituras</span><span className="cifra">{escrituras}</span><span className="tenue">{generadas30} versiones generadas en los últimos 30 días</span></Link>
        </section>
        <section className="tarjeta">
          <div className="tarjeta-cabecera"><h2>Alertas recientes</h2><Link className="tenue" href="/admin/alertas">Ver todas</Link></div>
          {!ultimasAlertas.length ? <Vacio icono="auditoria" titulo="Sin alertas pendientes" /> : (
            <ul className="historial">{ultimasAlertas.map((a) => (
              <li key={a.id}>
                <span>{a.mensaje}</span>
                <span className={`etiqueta ${SEVERIDAD[a.severidad] ?? 'informativa'}`}>{a.severidad.toLowerCase()}</span>
                <time>{fecha(a.creadaEn)}</time>
              </li>
            ))}</ul>
          )}
        </section>
      </div>
    </>
  );
}
