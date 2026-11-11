import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { Tabla } from '../../componentes';

/** Advertencias guardadas en el resultado de cada versión generada */
type Resultado = { advertencias?: { nivel: string }[]; faltantes?: string[] } | null;

export default async function Estadisticas({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const { mes } = await searchParams;
  const hoy = new Date();
  const [anio, m] = (mes && /^\d{4}-\d{2}$/.test(mes) ? mes : `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
  const desde = new Date(Date.UTC(anio, m - 1, 1, 5));
  const hasta = new Date(Date.UTC(anio, m, 1, 5));
  const periodo = `${anio}-${String(m).padStart(2, '0')}`;
  const [generaciones, porUsuario, plantillasUsadas] = await Promise.all([
    db.generacion.findMany({ where: { creadaEn: { gte: desde, lt: hasta } }, select: { estado: true, resultado: true, expedienteId: true } }),
    db.generacion.groupBy({ by: ['generadaPorId'], where: { creadaEn: { gte: desde, lt: hasta }, estado: 'COMPLETADA' }, _count: true }),
    db.expediente.groupBy({ by: ['plantillaNombre'], where: { creadoEn: { gte: desde, lt: hasta } }, _count: true, orderBy: { _count: { plantillaNombre: 'desc' } }, take: 15 }),
  ]);
  const usuarios = await db.usuario.findMany({ where: { id: { in: porUsuario.map((u) => u.generadaPorId) } }, select: { id: true, nombreCompleto: true } });
  const completas = generaciones.filter((g) => g.estado === 'COMPLETADA');
  const res = completas.map((g) => g.resultado as Resultado);
  const promedio = (f: (r: Resultado) => number) => (res.length ? (res.reduce((s, r) => s + f(r), 0) / res.length).toFixed(1) : '—');
  const escrituras = new Set(completas.map((g) => g.expedienteId)).size;
  return (
    <>
      <div className="fila entre encabezado">
        <h1>Estadísticas</h1>
        <form className="fila" method="get" style={{ gap: '0.5rem' }}>
          <input type="month" name="mes" defaultValue={periodo} aria-label="Mes" style={{ width: 'auto' }} />
          <button type="submit" className="secundario">Ver mes</button>
          <Link className="boton secundario" href={`/admin/consumo?mes=${periodo}`}>Consumo de IA</Link>
        </form>
      </div>
      <div className="rejilla cuatro">
        <div className="tarjeta"><div className="cifra">{escrituras}</div><div className="suave">escrituras generadas ({completas.length} versiones)</div></div>
        <div className="tarjeta"><div className="cifra">{completas.length ? (completas.length / Math.max(escrituras, 1)).toFixed(1) : '—'}</div><div className="suave">versiones por escritura</div></div>
        <div className="tarjeta"><div className="cifra">{promedio((r) => r?.faltantes?.length ?? 0)}</div><div className="suave">datos «FALTA» por versión</div></div>
        <div className="tarjeta"><div className="cifra">{promedio((r) => r?.advertencias?.filter((a) => a.nivel === 'CRITICA').length ?? 0)}</div><div className="suave">advertencias críticas por versión · {generaciones.filter((g) => g.estado === 'ERROR').length} con error</div></div>
      </div>
      <div className="rejilla dos">
        <section className="tarjeta"><h2>Plantillas más usadas</h2>
          {!plantillasUsadas.length ? <p className="suave">Sin datos.</p> : <Tabla apilable={false}><tbody>{plantillasUsadas.map((p) => <tr key={p.plantillaNombre}><td>{p.plantillaNombre}</td><td className="numero"><strong>{p._count}</strong></td></tr>)}</tbody></Tabla>}</section>
        <section className="tarjeta"><h2>Versiones generadas por usuario</h2>
          {!porUsuario.length ? <p className="suave">Sin datos.</p> : <Tabla apilable={false}><tbody>{porUsuario.map((u) => <tr key={u.generadaPorId}><td>{usuarios.find((x) => x.id === u.generadaPorId)?.nombreCompleto}</td><td className="numero"><strong>{u._count}</strong></td></tr>)}</tbody></Tabla>}</section>
      </div>
    </>
  );
}
