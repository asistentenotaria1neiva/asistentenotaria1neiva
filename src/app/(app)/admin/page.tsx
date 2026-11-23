import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { obtenerConfig } from '@/lib/configuracion';
import { creditosRestantes } from '@/lib/ia/consumo';
import { Vacio, fecha } from '../componentes';
import { Icono } from '../../Icono';
import { accionCreditos } from './acciones';
import { FormAdmin } from './formularios';

const usd = (x: number) => `US$ ${x.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const creditos = await creditosRestantes(await obtenerConfig('ia.creditos'));
  const bajo = creditos.ok && (creditos.saldoUSD < 5 || (creditos.diasRestantes !== null && creditos.diasRestantes < 3));
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
      <section className={`tarjeta${bajo ? ' con-alerta' : ''}`}>
        <div className="tarjeta-cabecera">
          <h2>Créditos de la API de Claude</h2>
          <Link className="tenue" href="/admin/consumo">Ver consumo</Link>
        </div>
        <div className="rejilla dos">
          <div className="indicador">
            <span className="rotulo"><Icono nombre="consumo" tamano={16} />Saldo disponible</span>
            {creditos.ok ? (
              <>
                <span className={`cifra${bajo ? ' peligro' : ''}`}>{usd(creditos.saldoUSD)}</span>
                <span className="tenue">
                  {creditos.diasRestantes === null ? 'sin consumo en los últimos 7 días' : `alcanza para unos ${Math.floor(creditos.diasRestantes)} días al ritmo actual (${usd(creditos.diarioUSD)} por día)`}
                </span>
                <span className="tenue">
                  {usd(creditos.registradoUSD)} registrados el {fecha(creditos.registradoEn)} − {usd(creditos.gastadoUSD)} gastados
                  {creditos.fuente === 'real' ? ' (costo real de Anthropic)' : ' (costo calculado por la aplicación)'}
                </span>
              </>
            ) : (
              <><span className="cifra">—</span><span className="tenue">{creditos.error} Escriba el saldo que muestra la consola de Anthropic.</span></>
            )}
          </div>
          <div>
            <FormAdmin
              accion={accionCreditos}
              campos={[{ nombre: 'saldo', etiqueta: 'Saldo actual (US$)', ayuda: 'El que aparece en console.anthropic.com → Billing. Regístrelo cada vez que recargue: desde ese momento se descuenta lo que se gaste.' }]}
              botones={[{ texto: 'Registrar saldo', clase: 'secundario' }]}
            />
          </div>
        </div>
        {creditos.ok && creditos.fuente === 'estimado' && (
          <p className="suave">El saldo es aproximado: se calcula con la tarifa de cada modelo porque no se pudo consultar el costo real ({creditos.aviso}).</p>
        )}
      </section>

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
