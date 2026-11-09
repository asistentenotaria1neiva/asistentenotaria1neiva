import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { consumoIA, type Totales } from '@/lib/servicios/consumo-ia';
import { EtiquetaEstado, Tabla, fecha } from '../../componentes';

const TAREAS: Record<string, string> = {
  EXTRACCION: 'Lectura de documentos',
  REVISION: 'Asistente, revisión y corrección',
  REDACCION: 'Redacción de la escritura',
  PLANTILLA: 'Revisión de plantillas',
  ESCRITURA: 'Revisión de escrituras',
};

const n = (x: number) => x.toLocaleString('es-CO');

type Parametros = { mes?: string; usuario?: string; tarea?: string; q?: string; estado?: string; orden?: string; ordenu?: string };
type Dir = 'asc' | 'desc';
type Orden = { campo: string; dir: Dir };

/** Columnas que se pueden ordenar: valor a comparar y si empieza ascendente (texto) o descendente (cifras) */
type Clave<T> = { valor: (x: T) => string | number | null; asc?: boolean };
const NUMERICAS = {
  llamadas: { valor: (x: Totales) => x.llamadas },
  entrada: { valor: (x: Totales) => x.tokensEntrada },
  cache: { valor: (x: Totales) => x.tokensCache },
  salida: { valor: (x: Totales) => x.tokensSalida },
  tokens: { valor: (x: Totales) => x.tokensEntrada + x.tokensCache + x.tokensSalida },
  costo: { valor: (x: Totales) => x.costoUSD },
} satisfies Record<string, Clave<Totales>>;

function leerOrden(texto: string | undefined, claves: Record<string, unknown>, porDefecto: Orden): Orden {
  const [campo, dir] = (texto ?? '').split(':');
  return campo in claves ? { campo, dir: dir === 'asc' ? 'asc' : 'desc' } : porDefecto;
}

function ordenar<T>(filas: T[], claves: Record<string, Clave<T>>, orden: Orden): T[] {
  const { valor } = claves[orden.campo];
  const signo = orden.dir === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    // Los vacíos siempre al final
    if (va === null || va === '') return vb === null || vb === '' ? 0 : 1;
    if (vb === null || vb === '') return -1;
    const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' });
    return r * signo;
  });
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default async function ConsumoIA({ searchParams }: { searchParams: Promise<Parametros> }) {
  await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const params = await searchParams;
  const { mes, usuario, q, estado } = params;
  const tarea = params.tarea && params.tarea in TAREAS ? params.tarea : undefined;
  const hoy = new Date();
  const todo = mes === 'todo';
  const periodo = !todo && mes && /^\d{4}-\d{2}$/.test(mes) ? mes : `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const [anio, m] = periodo.split('-').map(Number);
  const rango = todo ? {} : { desde: new Date(anio, m - 1, 1), hasta: new Date(anio, m, 1) };

  const [datos, personal] = await Promise.all([
    consumoIA({ ...rango, usuarioId: usuario || undefined, proposito: tarea }),
    db.usuario.findMany({ orderBy: { nombreCompleto: 'asc' }, select: { id: true, nombreCompleto: true } }),
  ]);
  type Escritura = (typeof datos.escrituras)[number];
  type Digitador = (typeof datos.digitadores)[number];

  const CLAVES_ESCRITURAS: Record<string, Clave<Escritura>> = {
    expediente: { valor: (e) => (e.existe ? e.numeroInterno : null), asc: true },
    escritura: { valor: (e) => e.numeroEscritura, asc: true },
    actos: { valor: (e) => e.actos, asc: true },
    estado: { valor: (e) => e.estado, asc: true },
    responsable: { valor: (e) => e.responsable, asc: true },
    fecha: { valor: (e) => e.ultima?.getTime() ?? null },
    ...NUMERICAS,
  };
  const CLAVES_DIGITADORES: Record<string, Clave<Digitador>> = {
    nombre: { valor: (d) => d.nombre, asc: true },
    escrituras: { valor: (d) => d.escrituras },
    promedio: { valor: (d) => d.promedioUSD },
    fecha: { valor: (d) => d.ultima?.getTime() ?? null },
    ...NUMERICAS,
  };
  const orden = leerOrden(params.orden, CLAVES_ESCRITURAS, { campo: 'costo', dir: 'desc' });
  const ordenu = leerOrden(params.ordenu, CLAVES_DIGITADORES, { campo: 'costo', dir: 'desc' });

  // Búsqueda y filtro de estado sobre la tabla de escrituras
  const busqueda = q?.trim() ? sinTildes(q.trim()) : '';
  const estados = [...new Set(datos.escrituras.map((e) => e.estado).filter((x): x is NonNullable<typeof x> => !!x))].sort();
  const filtradas = datos.escrituras.filter(
    (e) =>
      (!estado || e.estado === estado) &&
      (!busqueda || sinTildes([e.numeroInterno, e.numeroEscritura ? `${e.numeroEscritura}` : '', e.actos, e.responsable].join(' ')).includes(busqueda)),
  );
  const escrituras = ordenar(filtradas, CLAVES_ESCRITURAS, orden);
  const digitadores = ordenar(datos.digitadores, CLAVES_DIGITADORES, ordenu);
  const sumaFiltradas = filtradas.reduce((s, e) => s + e.costoUSD, 0);

  const usd = (x: number) => `US$ ${x.toFixed(x > 0 && x < 1 ? 3 : 2)}`;
  const filtroUsuario = usuario ? personal.find((p) => p.id === usuario)?.nombreCompleto : null;

  /** Enlace a esta misma página conservando los filtros, con los cambios indicados (null quita el parámetro) */
  const enlace = (cambios: Partial<Record<keyof Parametros, string | null>> = {}) => {
    const actual: Record<string, string | undefined> = { mes: todo ? 'todo' : periodo, usuario, tarea, q, estado, orden: params.orden, ordenu: params.ordenu };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...actual, ...cambios })) if (v) p.set(k, v);
    return `/admin/consumo?${p}`;
  };

  /** Encabezado que ordena la tabla: el primer clic usa el sentido natural de la columna, el siguiente lo invierte */
  const Th = ({ campo, tabla, numero, children }: { campo: string; tabla: 'orden' | 'ordenu'; numero?: boolean; children: React.ReactNode }) => {
    const actual = tabla === 'orden' ? orden : ordenu;
    const claves: Record<string, { asc?: boolean }> = tabla === 'orden' ? CLAVES_ESCRITURAS : CLAVES_DIGITADORES;
    const activo = actual.campo === campo;
    const dir: Dir = activo ? (actual.dir === 'asc' ? 'desc' : 'asc') : claves[campo].asc ? 'asc' : 'desc';
    return (
      <th className={numero ? 'numero' : undefined} aria-sort={activo ? (actual.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        <Link href={enlace({ [tabla]: `${campo}:${dir}` })} scroll={false} style={{ color: 'inherit', textDecoration: 'none', fontWeight: activo ? 600 : undefined }} title="Ordenar">
          {children}
          <span aria-hidden style={{ opacity: activo ? 1 : 0.35, marginLeft: 4 }}>{activo ? (actual.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
        </Link>
      </th>
    );
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
  const Encabezados = ({ tabla }: { tabla: 'orden' | 'ordenu' }) => (
    <>
      <Th campo="llamadas" tabla={tabla} numero>Llamadas</Th>
      <Th campo="entrada" tabla={tabla} numero>Tokens entrada</Th>
      <Th campo="cache" tabla={tabla} numero>Tokens caché</Th>
      <Th campo="salida" tabla={tabla} numero>Tokens salida</Th>
      <Th campo="costo" tabla={tabla} numero>US$</Th>
    </>
  );

  const hayFiltrosTabla = !!(busqueda || estado);

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
          <select name="tarea" defaultValue={tarea ?? ''} aria-label="Tarea" style={{ width: 'auto' }}>
            <option value="">Todas las tareas</option>
            {Object.entries(TAREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {q && <input type="hidden" name="q" value={q} />}
          {estado && <input type="hidden" name="estado" value={estado} />}
          {params.orden && <input type="hidden" name="orden" value={params.orden} />}
          {params.ordenu && <input type="hidden" name="ordenu" value={params.ordenu} />}
          <button type="submit" className="secundario">Ver</button>
          <Link className="boton secundario" href={enlace({ mes: 'todo' })}>Todo el historial</Link>
        </form>
      </div>
      <p className="suave">
        {todo ? 'Todo el historial' : `Mes ${periodo}`}
        {filtroUsuario && <> · solo {filtroUsuario} · <Link href={enlace({ usuario: null })}>ver todos</Link></>}
        {tarea && <> · solo {TAREAS[tarea].toLowerCase()} · <Link href={enlace({ tarea: null })}>todas las tareas</Link></>}
      </p>

      <div className="rejilla cuatro">
        <div className="tarjeta"><div className="cifra">{usd(datos.total.costoUSD)}</div><div className="suave">costo estimado</div></div>
        <div className="tarjeta"><div className="cifra">{n(datos.total.tokensEntrada + datos.total.tokensCache + datos.total.tokensSalida)}</div><div className="suave">tokens ({n(datos.total.tokensSalida)} de salida)</div></div>
        <div className="tarjeta"><div className="cifra">{n(datos.total.llamadas)}</div><div className="suave">llamadas a la IA · {datos.escrituras.length} escrituras{datos.revisiones.length ? ` · ${datos.revisiones.length} revisiones` : ''}</div></div>
        <div className="tarjeta"><div className="cifra">{datos.promedioPorEscrituraUSD === null ? '—' : usd(datos.promedioPorEscrituraUSD)}</div><div className="suave">promedio por escritura</div></div>
      </div>

      <section className="tarjeta">
        <h2>Por digitador</h2>
        {!digitadores.length ? <p className="suave">Sin consumo en este periodo.</p> : (
          <Tabla>
            <thead><tr>
              <Th campo="nombre" tabla="ordenu">Usuario</Th>
              <Th campo="escrituras" tabla="ordenu" numero>Escrituras</Th>
              <Encabezados tabla="ordenu" />
              <Th campo="promedio" tabla="ordenu" numero>Promedio por escritura</Th>
              <Th campo="fecha" tabla="ordenu">Último uso</Th>
            </tr></thead>
            <tbody>{digitadores.map((d) => (
              <tr key={d.usuarioId ?? 'ninguno'}>
                <td className="principal-celda">{d.usuarioId ? <Link href={enlace({ usuario: d.usuarioId })}>{d.nombre}</Link> : d.nombre}{d.rol && <span className="suave"> · {d.rol.toLowerCase()}</span>}</td>
                <td data-etiqueta="Escrituras" className="numero">{d.escrituras}</td>
                <Columnas t={d} />
                <td data-etiqueta="Promedio por escritura" className="numero">{d.promedioUSD === null ? '—' : usd(d.promedioUSD)}</td>
                <td data-etiqueta="Último uso" className="suave">{fecha(d.ultima)}</td>
              </tr>
            ))}</tbody>
          </Tabla>
        )}
      </section>

      <section className="tarjeta">
        <div className="fila entre" style={{ gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Por escritura</h2>
          <form className="fila" method="get" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
            {Object.entries({ mes: todo ? 'todo' : periodo, usuario, tarea, orden: params.orden, ordenu: params.ordenu }).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
            <input type="search" name="q" defaultValue={q ?? ''} placeholder="Buscar expediente, escritura, acto o responsable" aria-label="Buscar" style={{ width: 'min(340px, 100%)' }} />
            <select name="estado" defaultValue={estado ?? ''} aria-label="Estado" style={{ width: 'auto' }}>
              <option value="">Todos los estados</option>
              {estados.map((e) => <option key={e} value={e}>{e.replace(/_/g, ' ').toLowerCase()}</option>)}
            </select>
            <button type="submit" className="secundario">Filtrar</button>
            {hayFiltrosTabla && <Link className="boton secundario" href={enlace({ q: null, estado: null })}>Limpiar</Link>}
          </form>
        </div>
        {hayFiltrosTabla && datos.escrituras.length > 0 && (
          <p className="suave">{escrituras.length} de {datos.escrituras.length} escrituras · {usd(sumaFiltradas)}</p>
        )}
        {!escrituras.length ? <p className="suave">{hayFiltrosTabla ? 'Ninguna escritura coincide con el filtro.' : 'Sin consumo en este periodo.'}</p> : (
          <Tabla>
            <thead><tr>
              <Th campo="expediente" tabla="orden">Expediente</Th>
              <Th campo="escritura" tabla="orden">Escritura</Th>
              <Th campo="actos" tabla="orden">Actos</Th>
              <Th campo="estado" tabla="orden">Estado</Th>
              <Th campo="responsable" tabla="orden">Responsable</Th>
              <Encabezados tabla="orden" />
              <Th campo="fecha" tabla="orden">Último uso</Th>
            </tr></thead>
            <tbody>{escrituras.map((e) => (
              <tr key={e.expedienteId}>
                <td className="principal-celda">{e.existe ? <Link href={`/expedientes/${e.expedienteId}`} className="radicado">{e.numeroInterno}</Link> : <span className="suave">{e.numeroInterno}</span>}</td>
                <td data-etiqueta="Escritura">{e.numeroEscritura ? `N.º ${e.numeroEscritura}` : <span className="suave">—</span>}</td>
                <td data-etiqueta="Actos">{e.actos}</td>
                <td data-etiqueta="Estado">{e.estado ? <EtiquetaEstado estado={e.estado} /> : '—'}</td>
                <td data-etiqueta="Responsable">{e.responsable}</td>
                <Columnas t={e} />
                <td data-etiqueta="Último uso" className="suave">{fecha(e.ultima)}</td>
              </tr>
            ))}</tbody>
          </Tabla>
        )}
        {filtroUsuario && <p className="suave">Solo lo que {filtroUsuario} consumió en cada escritura.</p>}
      </section>

      <section className="tarjeta">
        <h2>Por revisión de escritura</h2>
        {!datos.revisiones.length ? <p className="suave">Sin revisiones de escrituras en este periodo.</p> : (
          <>
            <p className="suave">
              {datos.revisiones.length} revisión(es) · {usd(datos.revisiones.reduce((s, r) => s + r.costoUSD, 0))} en total
              {datos.promedioPorRevisionUSD !== null && <> · promedio {usd(datos.promedioPorRevisionUSD)} por revisión</>}.
              Cada revisión suma sus llamadas: ubicar la escritura y los soportes en el PDF, transcribirla y revisarla (y las veces que se revisó de nuevo).
            </p>
            <Tabla>
              <thead><tr>
                <th>Revisión</th><th>Estado</th><th className="numero">Páginas</th><th className="numero">Cambios</th><th>Cargada por</th>
                <th className="numero">Llamadas</th><th className="numero">Tokens entrada</th><th className="numero">Tokens caché</th><th className="numero">Tokens salida</th><th className="numero">US$</th>
                <th className="numero">US$ por página</th><th>Último uso</th>
              </tr></thead>
              <tbody>{datos.revisiones.map((r) => (
                <tr key={r.revisionId}>
                  <td className="principal-celda">{r.existe ? <Link href={`/revisiones/${r.revisionId}`}>{r.nombre}</Link> : <span className="suave">{r.nombre}</span>}{r.tipo && <div className="suave">{r.tipo}</div>}</td>
                  <td data-etiqueta="Estado">{r.estado ? <span className={`etiqueta ${r.estado === 'COMPLETADA' ? 'ok' : r.estado === 'ERROR' ? 'critica' : 'informativa'}`}>{r.estado === 'COMPLETADA' ? 'Revisada' : r.estado === 'ERROR' ? 'Error' : 'En curso'}</span> : '—'}</td>
                  <td data-etiqueta="Páginas" className="numero">{r.paginas ?? '—'}</td>
                  <td data-etiqueta="Cambios" className="numero">{r.cambios ?? '—'}</td>
                  <td data-etiqueta="Cargada por">{r.cargadaPor}</td>
                  <Columnas t={r} />
                  <td data-etiqueta="US$ por página" className="numero">{r.paginas ? usd(r.costoUSD / r.paginas) : '—'}</td>
                  <td data-etiqueta="Último uso" className="suave">{fecha(r.ultima)}</td>
                </tr>
              ))}</tbody>
            </Tabla>
          </>
        )}
        {filtroUsuario && datos.revisiones.length > 0 && <p className="suave">Solo lo que {filtroUsuario} consumió en cada revisión.</p>}
      </section>

      <div className="rejilla dos">
        <section className="tarjeta">
          <h2>Por tarea</h2>
          {!datos.porProposito.length ? <p className="suave">Sin datos.</p> : (
            <Tabla apilable={false}>
              <thead><tr><th>Tarea</th><th className="numero">Llamadas</th><th className="numero">Tokens</th><th className="numero">US$</th></tr></thead>
              <tbody>{datos.porProposito.map((p) => (
                <tr key={p.proposito}>
                  <td>{p.proposito in TAREAS && !tarea ? <Link href={enlace({ tarea: p.proposito })}>{TAREAS[p.proposito]}</Link> : TAREAS[p.proposito] ?? p.proposito}</td>
                  <td className="numero">{n(p.llamadas)}</td><td className="numero">{n(p.tokensEntrada + p.tokensCache + p.tokensSalida)}</td><td className="numero"><strong>{usd(p.costoUSD)}</strong></td>
                </tr>
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
        Haga clic en el título de una columna para ordenar la tabla; otro clic invierte el orden.
        El costo se calcula con la tarifa de Anthropic de cada modelo al momento de la llamada (entrada, salida, lectura y escritura de caché).
        {datos.historicos > 0 && <> {n(datos.historicos)} registros son anteriores a este panel: se asignaron al responsable del expediente y no incluyen la escritura de caché.</>}
      </p>
    </>
  );
}
