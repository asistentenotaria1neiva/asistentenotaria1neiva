import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { indicadoresMes } from '@/lib/servicios/aprendizaje';

export default async function Estadisticas({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const { mes } = await searchParams;
  const hoy = new Date();
  const [anio, m] = (mes && /^\d{4}-\d{2}$/.test(mes) ? mes : `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
  const [ind, porTipo, porUsuario, frecuentes] = await Promise.all([
    indicadoresMes(anio, m),
    db.expediente.groupBy({ by: ['tipoId'], _count: true, orderBy: { _count: { tipoId: 'desc' } } }),
    db.expediente.groupBy({ by: ['responsableId'], _count: true }),
    db.observacion.groupBy({ by: ['codigo', 'nivel'], _count: true, orderBy: { _count: { codigo: 'desc' } }, take: 15 }),
  ]);
  const usuarios = await db.usuario.findMany({ where: { id: { in: porUsuario.map((u) => u.responsableId) } }, select: { id: true, nombreCompleto: true } });
  const tipos = await db.tipoEscritura.findMany({ select: { id: true, nombre: true } });
  const periodo = `${anio}-${String(m).padStart(2, '0')}`;
  return (
    <>
      <div className="fila entre">
        <h1>Estadísticas e indicadores</h1>
        <form className="fila" method="get"><input type="text" name="mes" defaultValue={periodo} pattern="\d{4}-\d{2}" aria-label="Mes (AAAA-MM)" style={{ width: 110 }} /><button type="submit" className="secundario">Ver mes</button>
          <Link className="boton" href={`/admin/estadisticas/informe?mes=${periodo}`}>Informe mensual para el notario</Link></form>
      </div>
      <div className="rejilla cuatro">
        <div className="tarjeta"><div className="cifra">{ind.datosExtraidos.porcentajeSinCorreccion ?? '—'}{ind.datosExtraidos.porcentajeSinCorreccion !== null && '%'}</div><div className="suave">datos extraídos sin corrección ({ind.datosExtraidos.revisados} revisados)</div></div>
        <div className="tarjeta"><div className="cifra">{ind.observaciones.porcentajeAcierto ?? '—'}{ind.observaciones.porcentajeAcierto !== null && '%'}</div><div className="suave">observaciones acertadas ({ind.observaciones.falsasAlarmas} falsas alarmas)</div></div>
        <div className="tarjeta"><div className="cifra">{ind.escrituras.horasPromedio ?? '—'}</div><div className="suave">horas promedio por escritura ({ind.escrituras.aprobadas} aprobadas)</div></div>
        <div className="tarjeta"><div className="cifra">{ind.escrituras.devueltas}</div><div className="suave">escrituras devueltas por el revisor</div></div>
      </div>
      <div className="rejilla dos">
        <section className="tarjeta"><h2 style={{ marginTop: 0 }}>Escrituras por tipo (acto principal)</h2>
          <table><tbody>{porTipo.map((t) => <tr key={t.tipoId}><td>{tipos.find((x) => x.id === t.tipoId)?.nombre}</td><td>{t._count}</td></tr>)}</tbody></table></section>
        <section className="tarjeta"><h2 style={{ marginTop: 0 }}>Escrituras por responsable</h2>
          <table><tbody>{porUsuario.map((u) => <tr key={u.responsableId}><td>{usuarios.find((x) => x.id === u.responsableId)?.nombreCompleto}</td><td>{u._count}</td></tr>)}</tbody></table></section>
        <section className="tarjeta"><h2 style={{ marginTop: 0 }}>Observaciones más frecuentes</h2>
          <table><tbody>{frecuentes.map((o) => <tr key={`${o.codigo}${o.nivel}`}><td>{o.codigo}</td><td>{o.nivel.toLowerCase()}</td><td>{o._count}</td></tr>)}</tbody></table></section>
        <section className="tarjeta"><h2 style={{ marginTop: 0 }}>Consumo de la API de Claude ({periodo})</h2>
          <p>{ind.api.llamadas} llamadas · {ind.api.tokensEntrada.toLocaleString('es-CO')} tokens de entrada · {ind.api.tokensSalida.toLocaleString('es-CO')} de salida</p>
          <p className="cifra">US$ {ind.api.costoUSD.toFixed(2)}</p><p className="suave">Costo estimado con precios de referencia por millón de tokens; la factura real está en la consola de Anthropic.</p></section>
      </div>
    </>
  );
}
