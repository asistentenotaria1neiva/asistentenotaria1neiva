import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { consumoIA, modelosUsados, type Totales } from '@/lib/servicios/consumo-ia';
import { Icono } from '@/app/Icono';
import { Tabla, fecha } from '../../componentes';

const TAREAS: Record<string, string> = {
  LECTURA: 'Lectura de documentos (Haiku)',
  EXTRACCION: 'Lectura de documentos (sistema anterior)',
  REDACCION: 'Adaptación de la plantilla y revisión (Sonnet)',
  REVISION: 'Asistente y revisión (sistema anterior)',
  PLANTILLA: 'Revisión de plantillas (sistema anterior)',
  ESCRITURA: 'Revisión de escrituras (sistema anterior)',
};

const n = (x: number) => x.toLocaleString('es-CO');

type Parametros = {
  periodo?: string; desde?: string; hasta?: string; mes?: string;
  usuario?: string; tarea?: string; modelo?: string; q?: string; estado?: string; orden?: string; ordenu?: string;
};

/** Periodos rápidos; los días son de Colombia (UTC−5, sin horario de verano) */
const PERIODOS = {
  hoy: 'Hoy',
  ayer: 'Ayer',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  mes: 'Este mes',
  mesant: 'Mes anterior',
  todo: 'Todo el historial',
} as const;
type Periodo = keyof typeof PERIODOS;

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const hoyColombia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
/** Suma días a una fecha AAAA-MM-DD */
const sumarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
/** Medianoche de Colombia de ese día, en UTC */
const inicioDia = (iso: string) => new Date(`${iso}T05:00:00Z`);
const ultimoDiaMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
const diaLargo = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const diaCorto = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const nombreMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes - 1, 15)).toLocaleDateString('es-CO', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/** Resuelve el periodo pedido: rango de fechas (gana), mes AAAA-MM (enlaces anteriores) o periodo rápido */
function resolverPeriodo(p: Parametros): { clave: Periodo | null; desde?: string; hasta?: string; etiqueta: string } {
  const hoy = hoyColombia();
  const [a, m] = hoy.split('-').map(Number);
  let desde = p.desde && DIA.test(p.desde) ? p.desde : undefined;
  let hasta = p.hasta && DIA.test(p.hasta) ? p.hasta : undefined;
  if (desde || hasta) {
    if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
    const etiqueta = desde && hasta
      ? desde === hasta ? diaLargo(desde) : `Del ${diaCorto(desde)} al ${diaCorto(hasta)}`
      : desde ? `Desde el ${diaCorto(desde)}` : `Hasta el ${diaCorto(hasta!)}`;
    return { clave: null, desde, hasta, etiqueta };
  }
  if (p.mes && /^\d{4}-\d{2}$/.test(p.mes) && !p.periodo) {
    const [ma, mm] = p.mes.split('-').map(Number);
    if (ma === a && mm === m) return { clave: 'mes', desde: `${p.mes}-01`, hasta: hoy, etiqueta: PERIODOS.mes };
    return { clave: null, desde: `${p.mes}-01`, hasta: ultimoDiaMes(ma, mm), etiqueta: nombreMes(ma, mm) };
  }
  const clave: Periodo = p.periodo && p.periodo in PERIODOS ? (p.periodo as Periodo) : 'mes';
  switch (clave) {
    case 'hoy': return { clave, desde: hoy, hasta: hoy, etiqueta: `Hoy, ${diaLargo(hoy)}` };
    case 'ayer': { const d = sumarDias(hoy, -1); return { clave, desde: d, hasta: d, etiqueta: `Ayer, ${diaLargo(d)}` }; }
    case '7d': return { clave, desde: sumarDias(hoy, -6), hasta: hoy, etiqueta: PERIODOS['7d'] };
    case '30d': return { clave, desde: sumarDias(hoy, -29), hasta: hoy, etiqueta: PERIODOS['30d'] };
    case 'mesant': {
      const [pa, pm] = m === 1 ? [a - 1, 12] : [a, m - 1];
      return { clave, desde: `${pa}-${String(pm).padStart(2, '0')}-01`, hasta: ultimoDiaMes(pa, pm), etiqueta: `Mes anterior · ${nombreMes(pa, pm)}` };
    }
    case 'todo': return { clave, etiqueta: PERIODOS.todo };
    default: return { clave: 'mes', desde: `${hoy.slice(0, 7)}-01`, hasta: hoy, etiqueta: `Este mes · ${nombreMes(a, m)}` };
  }
}
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
  const { usuario, q, estado } = params;
  const tarea = params.tarea && params.tarea in TAREAS ? params.tarea : undefined;
  // Compatibilidad: ?mes=todo de los enlaces anteriores
  const periodo = resolverPeriodo(params.mes === 'todo' ? { ...params, mes: undefined, periodo: 'todo' } : params);
  const esRango = periodo.clave === null;
  const rango = { desde: periodo.desde ? inicioDia(periodo.desde) : undefined, hasta: periodo.hasta ? inicioDia(sumarDias(periodo.hasta, 1)) : undefined };

  const [personal, modelos] = await Promise.all([
    db.usuario.findMany({ orderBy: { nombreCompleto: 'asc' }, select: { id: true, nombreCompleto: true } }),
    modelosUsados(),
  ]);
  const modelo = params.modelo && modelos.includes(params.modelo) ? params.modelo : undefined;
  const datos = await consumoIA({ ...rango, usuarioId: usuario || undefined, proposito: tarea, modelo });
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
  /** El periodo tal como va en la dirección: rango de fechas o periodo rápido */
  const estadoPeriodo: Partial<Record<'periodo' | 'desde' | 'hasta', string>> = esRango
    ? { desde: periodo.desde, hasta: periodo.hasta }
    : periodo.clave === 'mes' ? {} : { periodo: periodo.clave! };
  /** Cambiar de periodo quita el rango de fechas (y el mes de los enlaces anteriores) */
  const conPeriodo = (cambios: Partial<Record<'periodo' | 'desde' | 'hasta', string | null>>) => ({ periodo: null, desde: null, hasta: null, ...cambios });

  /** Enlace a esta misma página conservando los filtros, con los cambios indicados (null quita el parámetro) */
  const enlace = (cambios: Partial<Record<keyof Parametros, string | null>> = {}) => {
    const actual: Record<string, string | undefined> = { ...estadoPeriodo, usuario, tarea, modelo, q, estado, orden: params.orden, ordenu: params.ordenu };
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
        <Link href={enlace({ [tabla]: `${campo}:${dir}` })} scroll={false} className={`orden-columna${activo ? ' activa' : ''}`} title="Ordenar">
          {children}
          <span aria-hidden className="flecha-orden">{activo ? (actual.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
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
  const maxDia = Math.max(0, ...datos.porDia.map((d) => d.costoUSD));

  return (
    <>
      <div className="fila entre encabezado">
        <div>
          <h1>Consumo de IA{filtroUsuario ? ` · ${filtroUsuario}` : ''}</h1>
          <p className="suave">Tokens y costo por usuario, escritura, tarea y modelo.</p>
        </div>
      </div>

      <nav className="pestanas" aria-label="Periodo">
        {(Object.keys(PERIODOS) as Periodo[]).map((k) => (
          <Link key={k} href={enlace(conPeriodo(k === 'mes' ? {} : { periodo: k }))} aria-current={periodo.clave === k ? 'page' : undefined} scroll={false}>{PERIODOS[k]}</Link>
        ))}
      </nav>

      <form className="tarjeta compacta filtros" method="get" aria-label="Fechas y filtros">
        <label>Desde<input type="date" name="desde" defaultValue={esRango ? periodo.desde ?? '' : ''} max={hoyColombia()} /></label>
        <label>Hasta<input type="date" name="hasta" defaultValue={esRango ? periodo.hasta ?? '' : ''} max={hoyColombia()} /></label>
        <label>Usuario
          <select name="usuario" defaultValue={usuario ?? ''}>
            <option value="">Todos los usuarios</option>
            {personal.map((p) => <option key={p.id} value={p.id}>{p.nombreCompleto}</option>)}
          </select>
        </label>
        <label>Tarea
          <select name="tarea" defaultValue={tarea ?? ''}>
            <option value="">Todas las tareas</option>
            {Object.entries(TAREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Modelo
          <select name="modelo" defaultValue={modelo ?? ''}>
            <option value="">Todos los modelos</option>
            {modelos.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        {/* Sin fechas, se conserva el periodo rápido elegido */}
        {!esRango && periodo.clave !== 'mes' && <input type="hidden" name="periodo" value={periodo.clave!} />}
        {q && <input type="hidden" name="q" value={q} />}
        {estado && <input type="hidden" name="estado" value={estado} />}
        {params.orden && <input type="hidden" name="orden" value={params.orden} />}
        {params.ordenu && <input type="hidden" name="ordenu" value={params.ordenu} />}
        <div className="acciones-filtro">
          <button type="submit" className="secundario">Aplicar</button>
          {(esRango || usuario || tarea || modelo) && <Link className="boton fantasma" href="/admin/consumo">Quitar filtros</Link>}
        </div>
      </form>

      <div className="filtros-activos">
        <strong>{periodo.etiqueta}</strong>
        {esRango && <Link className="chip-filtro" href={enlace(conPeriodo({}))} aria-label="Quitar el rango de fechas">Fechas<Icono nombre="cerrar" tamano={14} /></Link>}
        {filtroUsuario && <Link className="chip-filtro" href={enlace({ usuario: null })} aria-label={`Quitar el filtro ${filtroUsuario}`}>{filtroUsuario}<Icono nombre="cerrar" tamano={14} /></Link>}
        {tarea && <Link className="chip-filtro" href={enlace({ tarea: null })} aria-label="Quitar el filtro de tarea">{TAREAS[tarea]}<Icono nombre="cerrar" tamano={14} /></Link>}
        {modelo && <Link className="chip-filtro" href={enlace({ modelo: null })} aria-label="Quitar el filtro de modelo">{modelo}<Icono nombre="cerrar" tamano={14} /></Link>}
      </div>

      <div className="rejilla cuatro">
        <div className="tarjeta compacta indicador"><span className="rotulo">Costo estimado</span><span className="cifra">{usd(datos.total.costoUSD)}</span><span className="tenue">tarifa de cada modelo</span></div>
        <div className="tarjeta compacta indicador"><span className="rotulo">Tokens</span><span className="cifra">{n(datos.total.tokensEntrada + datos.total.tokensCache + datos.total.tokensSalida)}</span><span className="tenue">{n(datos.total.tokensSalida)} de salida</span></div>
        <div className="tarjeta compacta indicador"><span className="rotulo">Llamadas a la IA</span><span className="cifra">{n(datos.total.llamadas)}</span><span className="tenue">{datos.escrituras.length} escrituras{datos.revisiones.length ? ` · ${datos.revisiones.length} revisiones` : ''}</span></div>
        <div className="tarjeta compacta indicador"><span className="rotulo">Promedio por escritura</span><span className="cifra">{datos.promedioPorEscrituraUSD === null ? '—' : usd(datos.promedioPorEscrituraUSD)}</span><span className="tenue">costo medio</span></div>
      </div>

      {datos.porDia.length > 1 && (
        <section className="tarjeta">
          <h2>Por día</h2>
          <p className="suave">
            {datos.porDia.length} días con consumo · promedio {usd(datos.total.costoUSD / datos.porDia.length)} por día con uso · día más alto {usd(maxDia)}.
            Haga clic en un día para ver solo ese día.
          </p>
          <Tabla etiqueta="Consumo por día">
            <thead><tr>
              <th>Día</th>
              <th className="numero">Llamadas</th><th className="numero">Tokens entrada</th><th className="numero">Tokens caché</th><th className="numero">Tokens salida</th><th className="numero">US$</th>
            </tr></thead>
            <tbody>{datos.porDia.map((d) => (
              <tr key={d.dia}>
                <td className="principal-celda">
                  <Link href={enlace(conPeriodo({ desde: d.dia, hasta: d.dia }))}>{diaLargo(d.dia)}</Link>
                  <span className="barra-uso" aria-hidden><span style={{ width: `${maxDia ? (d.costoUSD / maxDia) * 100 : 0}%` }} /></span>
                </td>
                <Columnas t={d} />
              </tr>
            ))}</tbody>
          </Tabla>
        </section>
      )}

      <section className="tarjeta">
        <h2>Por digitador</h2>
        {!digitadores.length ? <p className="suave">Sin consumo en este periodo.</p> : (
          <Tabla fija etiqueta="Consumo por digitador">
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
        <div className="tarjeta-cabecera">
          <h2>Por escritura</h2>
          <form className="fila chica filtros-linea" method="get" role="search" aria-label="Filtrar escrituras">
            {Object.entries({ ...estadoPeriodo, usuario, tarea, modelo, orden: params.orden, ordenu: params.ordenu }).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
            <input type="search" name="q" defaultValue={q ?? ''} placeholder="Buscar expediente, escritura, acto o responsable" aria-label="Buscar" className="busqueda-ancha" />
            <select name="estado" defaultValue={estado ?? ''} aria-label="Estado">
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
              <Th campo="actos" tabla="orden">Escritura y plantilla</Th>
              <Th campo="estado" tabla="orden">Estado</Th>
              <Th campo="responsable" tabla="orden">Responsable</Th>
              <Encabezados tabla="orden" />
              <Th campo="fecha" tabla="orden">Último uso</Th>
            </tr></thead>
            <tbody>{escrituras.map((e) => (
              <tr key={e.expedienteId}>
                <td className="principal-celda">{e.existe ? <Link href={`/expedientes/${e.expedienteId}`} className="radicado">{e.numeroInterno}</Link> : <span className="suave">{e.numeroInterno}</span>}</td>
                <td data-etiqueta="Escritura">{e.numeroEscritura ? `N.º ${e.numeroEscritura}` : <span className="suave">—</span>}</td>
                <td data-etiqueta="Escritura y plantilla">{e.actos}</td>
                <td data-etiqueta="Estado">{e.estado ?? '—'}</td>
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
                  <td className="principal-celda"><span className="suave">{r.nombre}</span>{r.tipo && <div className="suave">{r.tipo}</div>}</td>
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
                <tr key={p.modelo}><td>{modelo ? <code>{p.modelo}</code> : <Link href={enlace({ modelo: p.modelo })}><code>{p.modelo}</code></Link>}</td><td className="numero">{n(p.llamadas)}</td><td className="numero">{n(p.tokensEntrada + p.tokensCache + p.tokensSalida)}</td><td className="numero"><strong>{usd(p.costoUSD)}</strong></td></tr>
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
