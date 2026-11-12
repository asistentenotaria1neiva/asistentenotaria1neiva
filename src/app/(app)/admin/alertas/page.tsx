import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { accionAlerta } from '../acciones';
import { FormAdmin } from '../formularios';
import { Tabla, Vacio, fecha } from '../../componentes';

const SEVERIDAD: Record<string, { clase: string; texto: string }> = { ALTA: { clase: 'critica', texto: 'Alta' }, MEDIA: { clase: 'advertencia', texto: 'Media' }, BAJA: { clase: 'informativa', texto: 'Baja' } };

export const metadata = { title: 'Alertas' };

export default async function Alertas({ searchParams }: { searchParams: Promise<{ todas?: string }> }) {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const { todas } = await searchParams;
  const alertas = await db.alerta.findMany({ where: todas ? {} : { atendida: false }, orderBy: { creadaEn: 'desc' }, take: 300 });
  return (
    <>
      <div className="fila entre encabezado">
        <div>
          <h1>Alertas de seguridad</h1>
          <p className="suave">Equipos no autorizados, intentos desde redes externas, bloqueos de cuentas, accesos remotos del administrador y equipos pendientes. Revíselas a diario.</p>
        </div>
        {!todas && alertas.length > 0 && <FormAdmin accion={accionAlerta} ocultos={{ id: 'todas' }} botones={[{ texto: 'Marcar todas como atendidas', clase: 'secundario' }]} />}
      </div>
      <nav className="pestanas" aria-label="Filtro de alertas">
        <Link href="/admin/alertas" aria-current={!todas ? 'page' : undefined}>Pendientes</Link>
        <Link href="/admin/alertas?todas=1" aria-current={todas ? 'page' : undefined}>Todas</Link>
      </nav>
      {!alertas.length ? (
        <section className="tarjeta"><Vacio icono="auditoria" titulo={todas ? 'No hay alertas' : 'Sin alertas pendientes'}><p>{todas ? 'Aún no se ha registrado ninguna alerta.' : 'Todo está atendido.'}</p></Vacio></section>
      ) : (
        <Tabla fija etiqueta="Alertas">
          <thead><tr><th>Mensaje</th><th>Severidad</th><th>Tipo</th><th>Fecha</th><th aria-label="Acciones" /></tr></thead>
          <tbody>{alertas.map((a) => {
            const sev = SEVERIDAD[a.severidad] ?? { clase: 'informativa', texto: a.severidad.toLowerCase() };
            return (
              <tr key={a.id}>
                <td className="principal-celda">{a.mensaje}</td>
                <td data-etiqueta="Severidad"><span className={`etiqueta ${sev.clase}`}>{sev.texto}</span></td>
                <td data-etiqueta="Tipo" className="suave">{a.tipo.replace(/_/g, ' ').toLowerCase()}</td>
                <td data-etiqueta="Fecha" className="suave">{fecha(a.creadaEn)}</td>
                <td className="acciones">{a.atendida ? <span className="etiqueta ok">Atendida</span> : <FormAdmin accion={accionAlerta} ocultos={{ id: a.id }} botones={[{ texto: 'Marcar atendida', clase: 'secundario' }]} />}</td>
              </tr>
            );
          })}</tbody>
        </Tabla>
      )}
    </>
  );
}
