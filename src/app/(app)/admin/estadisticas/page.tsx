import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { Tabla, Vacio } from '../../componentes';
import { Icono } from '../../../Icono';

/** Advertencias guardadas en el resultado de cada versión generada */
type Resultado = { advertencias?: { nivel: string }[]; faltantes?: string[] } | null;

export const metadata = { title: 'Estadísticas' };

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
  const conError = generaciones.filter((g) => g.estado === 'ERROR').length;
  const maxPlantilla = Math.max(1, ...plantillasUsadas.map((p) => p._count));
  const maxUsuario = Math.max(1, ...porUsuario.map((u) => u._count));
  const nombreMes = desde.toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'America/Bogota' });
  return (
    <>
      <div className="fila entre encabezado">
        <div>
          <h1>Estadísticas</h1>
          <p className="suave">Resumen de {nombreMes}.</p>
        </div>
        <form className="fila chica" method="get" aria-label="Elegir el mes">
          <input type="month" name="mes" defaultValue={periodo} aria-label="Mes" />
          <button type="submit" className="secundario">Ver mes</button>
          <Link className="boton fantasma" href={`/admin/consumo?mes=${periodo}`}><Icono nombre="consumo" tamano={18} />Consumo de IA</Link>
        </form>
      </div>
      <div className="rejilla cuatro">
        <div className="tarjeta compacta indicador"><span className="rotulo"><Icono nombre="escrituras" tamano={16} />Escrituras generadas</span><span className="cifra">{escrituras}</span><span className="tenue">{completas.length} versiones</span></div>
        <div className="tarjeta compacta indicador"><span className="rotulo"><Icono nombre="versiones" tamano={16} />Versiones por escritura</span><span className="cifra">{completas.length ? (completas.length / Math.max(escrituras, 1)).toFixed(1) : '—'}</span><span className="tenue">promedio</span></div>
        <div className="tarjeta compacta indicador"><span className="rotulo"><span className="muestra-falta">FALTA</span> por versión</span><span className="cifra">{promedio((r) => r?.faltantes?.length ?? 0)}</span><span className="tenue">datos sin encontrar</span></div>
        <div className="tarjeta compacta indicador"><span className="rotulo"><Icono nombre="error" tamano={16} />Críticas por versión</span><span className="cifra">{promedio((r) => r?.advertencias?.filter((a) => a.nivel === 'CRITICA').length ?? 0)}</span><span className="tenue">{conError} versión(es) con error</span></div>
      </div>
      <div className="rejilla dos">
        <section className="tarjeta">
          <div className="tarjeta-cabecera"><h2>Plantillas más usadas</h2></div>
          {!plantillasUsadas.length ? <Vacio icono="plantilla" titulo="Sin datos este mes" /> : (
            <Tabla apilable={false}><tbody>{plantillasUsadas.map((p) => (
              <tr key={p.plantillaNombre}>
                <td>{p.plantillaNombre}<span className="barra-uso" aria-hidden="true"><span style={{ width: `${(p._count / maxPlantilla) * 100}%` }} /></span></td>
                <td className="numero"><strong>{p._count}</strong></td>
              </tr>
            ))}</tbody></Tabla>
          )}
        </section>
        <section className="tarjeta">
          <div className="tarjeta-cabecera"><h2>Versiones generadas por usuario</h2></div>
          {!porUsuario.length ? <Vacio icono="usuarios" titulo="Sin datos este mes" /> : (
            <Tabla apilable={false}><tbody>{porUsuario.map((u) => (
              <tr key={u.generadaPorId}>
                <td>{usuarios.find((x) => x.id === u.generadaPorId)?.nombreCompleto}<span className="barra-uso" aria-hidden="true"><span style={{ width: `${(u._count / maxUsuario) * 100}%` }} /></span></td>
                <td className="numero"><strong>{u._count}</strong></td>
              </tr>
            ))}</tbody></Tabla>
          )}
        </section>
      </div>
    </>
  );
}
