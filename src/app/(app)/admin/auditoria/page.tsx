import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { accionVerificarAuditoria } from '../acciones';
import { BotonVerificar } from '../formularios';
import { Tabla, fecha } from '../../componentes';

const POR_PAGINA = 100;

export default async function Auditoria({ searchParams }: { searchParams: Promise<{ usuario?: string; equipo?: string; accion?: string; desde?: string; hasta?: string; pagina?: string }> }) {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const q = await searchParams;
  const pagina = Math.max(1, Number(q.pagina) || 1);
  const donde: Prisma.AuditoriaWhereInput = {
    ...(q.usuario ? { usuarioNombre: { contains: q.usuario, mode: 'insensitive' } } : {}),
    ...(q.equipo ? { dispositivoId: q.equipo } : {}),
    ...(q.accion ? { accion: { contains: q.accion.toUpperCase() } } : {}),
    ...(q.desde || q.hasta ? { fecha: { ...(q.desde ? { gte: new Date(`${q.desde}T00:00:00-05:00`) } : {}), ...(q.hasta ? { lte: new Date(`${q.hasta}T23:59:59-05:00`) } : {}) } } : {}),
  };
  const [filas, total, equipos, acciones] = await Promise.all([
    db.auditoria.findMany({ where: donde, orderBy: { id: 'desc' }, take: POR_PAGINA, skip: (pagina - 1) * POR_PAGINA }),
    db.auditoria.count({ where: donde }),
    db.dispositivo.findMany({ select: { id: true, nombre: true } }),
    db.auditoria.findMany({ distinct: ['accion'], select: { accion: true }, orderBy: { accion: 'asc' } }),
  ]);
  const nombreEquipo = (id: string | null) => (id ? equipos.find((e) => e.id === id)?.nombre ?? id.slice(0, 8) : '—');
  const enlace = (p: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(q).filter(([, v]) => v)), pagina: String(p) })}`;
  return (
    <>
      <div className="fila entre encabezado" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 340px' }}>
          <h1>Auditoría</h1>
          <p className="suave">Registro inmodificable: la base de datos bloquea cambios y borrados, y cada registro encadena el hash del anterior.</p>
        </div>
        <BotonVerificar accion={accionVerificarAuditoria} />
      </div>
      <form className="tarjeta filtros" method="get">
        <div><label htmlFor="usuario">Usuario</label><input id="usuario" name="usuario" type="search" defaultValue={q.usuario} /></div>
        <div><label htmlFor="equipo">Equipo</label><select id="equipo" name="equipo" defaultValue={q.equipo ?? ''}><option value="">Todos</option>{equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
        <div><label htmlFor="accion">Acción</label><select id="accion" name="accion" defaultValue={q.accion ?? ''}><option value="">Todas</option>{acciones.map((a) => <option key={a.accion} value={a.accion}>{a.accion.replace(/_/g, ' ').toLowerCase()}</option>)}</select></div>
        <div><label htmlFor="desde">Desde</label><input id="desde" name="desde" type="date" defaultValue={q.desde} /></div>
        <div><label htmlFor="hasta">Hasta</label><input id="hasta" name="hasta" type="date" defaultValue={q.hasta} /></div>
        <div className="acciones-filtro">
          <button type="submit">Filtrar</button>
          {Object.entries(q).some(([k, v]) => k !== 'pagina' && v) && <a className="boton secundario" href="/admin/auditoria">Limpiar</a>}
        </div>
      </form>
      <p className="suave">{total.toLocaleString('es-CO')} registro(s) · página {pagina} de {Math.max(1, Math.ceil(total / POR_PAGINA))}</p>
      <Tabla>
        <thead><tr><th>#</th><th>Fecha</th><th>Usuario</th><th>Equipo / IP</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr></thead>
        <tbody>{filas.map((f) => (
          <tr key={String(f.id)}>
            <td className="suave principal-celda">#{String(f.id)}</td>
            <td data-etiqueta="Fecha" style={{ whiteSpace: 'nowrap' }}>{fecha(f.fecha)}</td>
            <td data-etiqueta="Usuario">{f.usuarioNombre ?? '—'}</td>
            <td data-etiqueta="Equipo / IP" className="suave">{nombreEquipo(f.dispositivoId)}<br />{f.ip}</td>
            <td data-etiqueta="Acción">{f.accion.replace(/_/g, ' ').toLowerCase()}</td>
            <td data-etiqueta="Entidad" className="suave">{f.entidad}{f.entidadId ? ` ${f.entidadId.slice(0, 10)}` : ''}</td>
            <td data-etiqueta="Detalle" className="suave">{f.detalle ? <code>{JSON.stringify(f.detalle).slice(0, 160)}</code> : '—'}</td>
          </tr>
        ))}</tbody>
      </Tabla>
      {!filas.length && <p className="suave vacio tarjeta">No hay registros con ese filtro.</p>}
      <div className="fila" style={{ marginTop: '1rem' }}>
        {pagina > 1 && <a className="boton secundario pequeno" href={enlace(pagina - 1)}>← Anterior</a>}
        {pagina * POR_PAGINA < total && <a className="boton secundario pequeno" href={enlace(pagina + 1)}>Siguiente →</a>}
      </div>
    </>
  );
}
