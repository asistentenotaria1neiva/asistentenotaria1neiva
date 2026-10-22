import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { indicadoresMes } from '@/lib/servicios/aprendizaje';
import { obtenerConfig } from '@/lib/configuracion';
import { costoRealUSD, creditosRestantes } from '@/lib/ia/consumo';
import { EtiquetaNivel, Tabla } from '../../componentes';

export default async function Estadisticas({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const { mes } = await searchParams;
  const hoy = new Date();
  const [anio, m] = (mes && /^\d{4}-\d{2}$/.test(mes) ? mes : `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
  const [ind, porTipo, porUsuario, frecuentes, costoMes, creditos] = await Promise.all([
    indicadoresMes(anio, m),
    db.expediente.groupBy({ by: ['tipoId'], _count: true, orderBy: { _count: { tipoId: 'desc' } } }),
    db.expediente.groupBy({ by: ['responsableId'], _count: true }),
    db.observacion.groupBy({ by: ['codigo', 'nivel'], _count: true, orderBy: { _count: { codigo: 'desc' } }, take: 15 }),
    costoRealUSD(new Date(Date.UTC(anio, m - 1, 1)), new Date(Math.min(Date.UTC(anio, m, 1), Date.now()))),
    obtenerConfig('ia.creditos').then(creditosRestantes),
  ]);
  const usuarios = await db.usuario.findMany({ where: { id: { in: porUsuario.map((u) => u.responsableId) } }, select: { id: true, nombreCompleto: true } });
  const tipos = await db.tipoEscritura.findMany({ select: { id: true, nombre: true } });
  const periodo = `${anio}-${String(m).padStart(2, '0')}`;
  return (
    <>
      <div className="fila entre encabezado">
        <h1>Estadísticas e indicadores</h1>
        <form className="fila" method="get" style={{ gap: '0.5rem' }}>
          <input type="month" name="mes" defaultValue={periodo} aria-label="Mes" style={{ width: 'auto' }} />
          <button type="submit" className="secundario">Ver mes</button>
          <Link className="boton" href={`/admin/estadisticas/informe?mes=${periodo}`}>Informe mensual</Link>
        </form>
      </div>
      <div className="rejilla cuatro">
        <div className="tarjeta"><div className="cifra">{ind.datosExtraidos.porcentajeSinCorreccion ?? '—'}{ind.datosExtraidos.porcentajeSinCorreccion !== null && '%'}</div><div className="suave">datos extraídos sin corrección ({ind.datosExtraidos.revisados} revisados)</div></div>
        <div className="tarjeta"><div className="cifra">{ind.observaciones.porcentajeAcierto ?? '—'}{ind.observaciones.porcentajeAcierto !== null && '%'}</div><div className="suave">observaciones acertadas ({ind.observaciones.falsasAlarmas} falsas alarmas)</div></div>
        <div className="tarjeta"><div className="cifra">{ind.escrituras.horasPromedio ?? '—'}</div><div className="suave">horas promedio por escritura ({ind.escrituras.aprobadas} aprobadas)</div></div>
        <div className="tarjeta"><div className="cifra">{ind.escrituras.devueltas}</div><div className="suave">escrituras devueltas por el revisor</div></div>
      </div>
      <div className="rejilla dos">
        <section className="tarjeta"><h2>Escrituras por tipo (acto principal)</h2>
          {!porTipo.length ? <p className="suave">Sin datos.</p> : <Tabla apilable={false}><tbody>{porTipo.map((t) => <tr key={t.tipoId}><td>{tipos.find((x) => x.id === t.tipoId)?.nombre}</td><td className="numero"><strong>{t._count}</strong></td></tr>)}</tbody></Tabla>}</section>
        <section className="tarjeta"><h2>Escrituras por responsable</h2>
          {!porUsuario.length ? <p className="suave">Sin datos.</p> : <Tabla apilable={false}><tbody>{porUsuario.map((u) => <tr key={u.responsableId}><td>{usuarios.find((x) => x.id === u.responsableId)?.nombreCompleto}</td><td className="numero"><strong>{u._count}</strong></td></tr>)}</tbody></Tabla>}</section>
        <section className="tarjeta"><h2>Observaciones más frecuentes</h2>
          {!frecuentes.length ? <p className="suave">Sin datos.</p> : <Tabla apilable={false}><tbody>{frecuentes.map((o) => <tr key={`${o.codigo}${o.nivel}`}><td>{o.codigo}</td><td><EtiquetaNivel nivel={o.nivel} /></td><td className="numero"><strong>{o._count}</strong></td></tr>)}</tbody></Tabla>}</section>
        <section className="tarjeta"><h2>Consumo de la API de Claude ({periodo})</h2>
          <div className="rejilla dos">
            <div><div className="cifra">{costoMes.ok ? `US$ ${costoMes.usd.toFixed(2)}` : '—'}</div><div className="suave">costo real del mes (Anthropic)</div></div>
            <div><div className="cifra">{creditos.ok ? `US$ ${creditos.usd.toFixed(2)}` : '—'}</div><div className="suave">créditos restantes</div></div>
          </div>
          {!costoMes.ok && <p className="aviso">{costoMes.error}</p>}
          {!creditos.ok && creditos.error !== (costoMes.ok ? '' : costoMes.error) && <p className="aviso">{creditos.error} <Link href="/admin/configuracion">Ir a Configuración</Link></p>}
          {creditos.ok && <p className="suave">Saldo registrado menos US$ {creditos.gastadoUSD?.toFixed(2)} gastados desde esa fecha. Actualice el saldo en Configuración (<code>ia.creditos</code>) cada vez que recargue.</p>}
          <p>{ind.api.llamadas} llamadas registradas por la aplicación · {ind.api.tokensEntrada.toLocaleString('es-CO')} tokens de entrada · {ind.api.tokensSalida.toLocaleString('es-CO')} de salida · US$ {ind.api.costoUSD.toFixed(2)} estimados</p>
          <p className="suave">El costo real lo informa Anthropic con unos minutos de retraso y por días completos (hora UTC).</p></section>
      </div>
    </>
  );
}
