import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { consumoIA, type Totales } from '@/lib/servicios/consumo-ia';
import { EtiquetaEstado, Tabla } from '../../componentes';

const TAREAS: Record<string, string> = {
  EXTRACCION: 'Lectura de documentos',
  REVISION: 'Asistente, revisión y corrección',
  REDACCION: 'Redacción de la escritura',
  PLANTILLA: 'Revisión de plantillas',
};

const n = (x: number) => x.toLocaleString('es-CO');

export default async function ConsumoIA({ searchParams }: { searchParams: Promise<{ mes?: string; usuario?: string }> }) {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const { mes, usuario } = await searchParams;
  const hoy = new Date();
  const todo = mes === 'todo';
  const periodo = !todo && mes && /^\d{4}-\d{2}$/.test(mes) ? mes : `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const [anio, m] = periodo.split('-').map(Number);
  const rango = todo ? {} : { desde: new Date(anio, m - 1, 1), hasta: new Date(anio, m, 1) };

  const [datos, personal] = await Promise.all([
    consumoIA({ ...rango, usuarioId: usuario || undefined }),
    db.usuario.findMany({ orderBy: { nombreCompleto: 'asc' }, select: { id: true, nombreCompleto: true } }),
  ]);
  const usd = (x: number) => `US$ ${x.toFixed(x > 0 && x < 1 ? 3 : 2)}`;
  const filtroUsuario = usuario ? personal.find((p) => p.id === usuario)?.nombreCompleto : null;
  const enlace = (q: { usuario?: string | null }) => {
    const p = new URLSearchParams({ mes: todo ? 'todo' : periodo });
    if (q.usuario) p.set('usuario', q.usuario);
    return `/admin/consumo?${p}`;
  };
  const Columnas = ({ t }: { t: Totales }) => (
    <>
      <td data-etiqueta="Llamadas" className="numero">{n(t.llamadas)}</td>
      <td data-etiqueta="Tokens entrada" className="numero">{n(t.tokensEntrada)}</td>
      <td data-etiqueta="Tokens caché" className="numero">{n(t.tokensCache)}</td>
      <td data-etiqueta="Tokens salida" className="numero">{n(t.tokensSalida)}</td>
      <td data-etiqueta="US$" className="numero"><strong>{usd(t.costoUSD)}</strong></td>
    </>
  );
  const Encabezados = () => (
    <>
      <th className="numero">Llamadas</th><th className="numero">Tokens entrada</th><th className="numero">Tokens caché</th><th className="numero">Tokens salida</th><th className="numero">US$</th>
    </>
  );

  return (
    <>
      <div className="fila entre encabezado">
        <h1>Consumo de IA{filtroUsuario ? ` · ${filtroUsuario}` : ''}</h1>
        <form className="fila" method="get" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <input type="month" name="mes" defaultValue={todo ? '' : periodo} aria-label="Mes" style={{ width: 'auto' }} />
          <select name="usuario" defaultValue={usuario ?? ''} aria-label="Digitador" style={{ width: 'auto' }}>
            <option value="">Todos los usuarios</option>
            {personal.map((p) => <option key={p.id} value={p.id}>{p.nombreCompleto}</option>)}
          </select>
          <button type="submit" className="secundario">Ver</button>
          <Link className="boton secundario" href={`/admin/consumo?mes=todo${usuario ? `&usuario=${usuario}` : ''}`}>Todo el historial</Link>
        </form>
      </div>
      <p className="suave">{todo ? 'Todo el historial' : `Mes ${periodo}`}{filtroUsuario && <> · solo {filtroUsuario} · <Link href={enlace({})}>ver todos</Link></>}</p>

      <div className="rejilla cuatro">
        <div className="tarjeta"><div className="cifra">{usd(datos.total.costoUSD)}</div><div className="suave">costo estimado</div></div>
        <div className="tarjeta"><div className="cifra">{n(datos.total.tokensEntrada + datos.total.tokensCache + datos.total.tokensSalida)}</div><div className="suave">tokens ({n(datos.total.tokensSalida)} de salida)</div></div>
        <div className="tarjeta"><div className="cifra">{n(datos.total.llamadas)}</div><div className="suave">llamadas a la IA · {datos.escrituras.length} escrituras</div></div>
        <div className="tarjeta"><div className="cifra">{datos.promedioPorEscrituraUSD === null ? '—' : usd(datos.promedioPorEscrituraUSD)}</div><div className="suave">promedio por escritura</div></div>
      </div>

      <section className="tarjeta">
        <h2>Por digitador</h2>
        {!datos.digitadores.length ? <p className="suave">Sin consumo en este periodo.</p> : (
          <Tabla>
            <thead><tr><th>Usuario</th><th className="numero">Escrituras</th><Encabezados /><th className="numero">Promedio por escritura</th></tr></thead>
            <tbody>{datos.digitadores.map((d) => (
              <tr key={d.usuarioId ?? 'ninguno'}>
                <td className="principal-celda">{d.usuarioId ? <Link href={enlace({ usuario: d.usuarioId })}>{d.nombre}</Link> : d.nombre}{d.rol && <span className="suave"> · {d.rol.toLowerCase()}</span>}</td>
                <td data-etiqueta="Escrituras" className="numero">{d.escrituras}</td>
                <Columnas t={d} />
                <td data-etiqueta="Promedio por escritura" className="numero">{d.promedioUSD === null ? '—' : usd(d.promedioUSD)}</td>
              </tr>
            ))}</tbody>
          </Tabla>
        )}
      </section>

      <section className="tarjeta">
        <h2>Por escritura</h2>
        {!datos.escrituras.length ? <p className="suave">Sin consumo en este periodo.</p> : (
          <Tabla>
            <thead><tr><th>Expediente</th><th>Escritura</th><th>Actos</th><th>Estado</th><th>Responsable</th><Encabezados /></tr></thead>
            <tbody>{datos.escrituras.map((e) => (
              <tr key={e.expedienteId}>
                <td className="principal-celda">{e.existe ? <Link href={`/expedientes/${e.expedienteId}`} className="radicado">{e.numeroInterno}</Link> : <span className="suave">{e.numeroInterno}</span>}</td>
                <td data-etiqueta="Escritura">{e.numeroEscritura ? `N.º ${e.numeroEscritura}` : <span className="suave">—</span>}</td>
                <td data-etiqueta="Actos">{e.actos}</td>
                <td data-etiqueta="Estado">{e.estado ? <EtiquetaEstado estado={e.estado} /> : '—'}</td>
                <td data-etiqueta="Responsable">{e.responsable}</td>
                <Columnas t={e} />
              </tr>
            ))}</tbody>
          </Tabla>
        )}
        {filtroUsuario && <p className="suave">Solo lo que {filtroUsuario} consumió en cada escritura.</p>}
      </section>

      <div className="rejilla dos">
        <section className="tarjeta">
          <h2>Por tarea</h2>
          {!datos.porProposito.length ? <p className="suave">Sin datos.</p> : (
            <Tabla apilable={false}>
              <thead><tr><th>Tarea</th><th className="numero">Llamadas</th><th className="numero">Tokens</th><th className="numero">US$</th></tr></thead>
              <tbody>{datos.porProposito.map((p) => (
                <tr key={p.proposito}><td>{TAREAS[p.proposito] ?? p.proposito}</td><td className="numero">{n(p.llamadas)}</td><td className="numero">{n(p.tokensEntrada + p.tokensCache + p.tokensSalida)}</td><td className="numero"><strong>{usd(p.costoUSD)}</strong></td></tr>
              ))}</tbody>
            </Tabla>
          )}
          {datos.plantillas.llamadas > 0 && <p className="suave">Las plantillas no son de una escritura: {usd(datos.plantillas.costoUSD)} en {datos.plantillas.llamadas} llamadas.</p>}
        </section>
        <section className="tarjeta">
          <h2>Por modelo</h2>
          {!datos.porModelo.length ? <p className="suave">Sin datos.</p> : (
            <Tabla apilable={false}>
              <thead><tr><th>Modelo</th><th className="numero">Llamadas</th><th className="numero">Tokens</th><th className="numero">US$</th></tr></thead>
              <tbody>{datos.porModelo.map((p) => (
                <tr key={p.modelo}><td><code>{p.modelo}</code></td><td className="numero">{n(p.llamadas)}</td><td className="numero">{n(p.tokensEntrada + p.tokensCache + p.tokensSalida)}</td><td className="numero"><strong>{usd(p.costoUSD)}</strong></td></tr>
              ))}</tbody>
            </Tabla>
          )}
        </section>
      </div>

      <p className="suave">
        El costo se calcula con la tarifa de Anthropic de cada modelo al momento de la llamada (entrada, salida, lectura y escritura de caché).        {datos.historicos > 0 && <> {n(datos.historicos)} registros son anteriores a este panel: se asignaron al responsable del expediente y no incluyen la escritura de caché.</>}
      </p>
    </>
  );
}
