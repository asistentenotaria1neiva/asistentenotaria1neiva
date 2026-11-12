/**
 * Buscador de la biblioteca de plantillas (servidor): filtros por texto, categoría, subcategoría, año y
 * fecha; la lista de resultados y, al lado, la vista previa de la plantilla elegida (?ver=id) con las
 * acciones que pasa cada página (usar la plantilla, editarla…). En móvil la vista previa ocupa la pantalla.
 */
import Link from 'next/link';
import type { SesionActiva } from '@/lib/sesion-tipos';
import { buscarPlantillas, opcionesFiltro, obtenerPlantilla, filtroDesdeParametros } from '@/lib/servicios/plantillas';
import { fecha, Vacio } from '../componentes';
import { Icono } from '../../Icono';
import { FiltrosPlantillas } from './FiltrosPlantillas';
import { VisorDocx } from './VisorDocx';

type Parametros = Record<string, string | string[] | undefined>;

const PARAMETROS = ['q', 'categoria', 'subcategoria', 'anio', 'desde', 'hasta', 'retiradas', 'pagina', 'ver'];

/** Enlace a la misma página con los parámetros cambiados (null quita el parámetro) */
function enlace(base: string, p: Parametros, cambios: Record<string, string | number | null>): string {
  const u = new URLSearchParams();
  for (const k of PARAMETROS) {
    const v = k in cambios ? cambios[k] : (Array.isArray(p[k]) ? p[k]![0] : p[k]);
    if (v !== null && v !== undefined && String(v) !== '') u.set(k, String(v));
  }
  const q = u.toString();
  return q ? `${base}?${q}` : base;
}

const texto = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const fechaCorta = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' });

export async function Buscador({ s, parametros, base, acciones, administrar = false }: {
  s: SesionActiva;
  parametros: Parametros;
  /** Ruta de la página que muestra el buscador */
  base: string;
  /** Acciones sobre la plantilla elegida en la vista previa */
  acciones?: (p: NonNullable<Awaited<ReturnType<typeof obtenerPlantilla>>>) => React.ReactNode;
  administrar?: boolean;
}) {
  const filtro = filtroDesdeParametros(parametros);
  const ver = typeof parametros.ver === 'string' ? parametros.ver : undefined;
  const [r, opciones, elegida] = await Promise.all([buscarPlantillas(s, filtro), opcionesFiltro(), ver ? obtenerPlantilla(ver) : null]);
  const visible = elegida && (elegida.activa || administrar) ? elegida : null;
  const filtrado = !!(filtro.q || filtro.categoria || filtro.subcategoria || filtro.anio || filtro.desde || filtro.hasta);
  // Filtros activos como chips que se quitan con un clic (al quitar la categoría también se quita el banco)
  const activos: { texto: string; quitar: Record<string, null> }[] = [
    ...(filtro.q ? [{ texto: `«${filtro.q}»`, quitar: { q: null } }] : []),
    ...(filtro.categoria ? [{ texto: filtro.categoria, quitar: { categoria: null, subcategoria: null } }] : []),
    ...(filtro.subcategoria ? [{ texto: filtro.subcategoria, quitar: { subcategoria: null } }] : []),
    ...(filtro.anio ? [{ texto: String(filtro.anio), quitar: { anio: null } }] : []),
    ...(texto(parametros.desde) ? [{ texto: `Desde ${fechaCorta(texto(parametros.desde))}`, quitar: { desde: null } }] : []),
    ...(texto(parametros.hasta) ? [{ texto: `Hasta ${fechaCorta(texto(parametros.hasta))}`, quitar: { hasta: null } }] : []),
    ...(filtro.retiradas ? [{ texto: 'Con retiradas', quitar: { retiradas: null } }] : []),
  ];
  return (
    <>
      <FiltrosPlantillas
        base={base}
        valores={{ q: filtro.q ?? '', categoria: filtro.categoria ?? '', subcategoria: filtro.subcategoria ?? '', anio: filtro.anio ? String(filtro.anio) : '', desde: texto(parametros.desde), hasta: texto(parametros.hasta), retiradas: filtro.retiradas ?? false }}
        categorias={opciones.categorias}
        anios={opciones.anios}
        administrar={administrar}
        activos={activos.length > 0 && (
          <div className="filtros-activos">
            <span>Filtros:</span>
            {activos.map((a) => (
              <Link key={a.texto} className="chip-filtro" href={enlace(base, parametros, { ...a.quitar, pagina: null, ver: null })} aria-label={`Quitar el filtro ${a.texto}`}>
                {a.texto}<Icono nombre="cerrar" tamano={14} />
              </Link>
            ))}
            {activos.length > 1 && <Link href={base} className="tenue">Quitar todos</Link>}
          </div>
        )}
      />
      <div className="biblioteca">
        <section className="tarjeta resultados-plantillas" aria-label="Plantillas encontradas">
          <p className="total" aria-live="polite">{r.total.toLocaleString('es-CO')} plantilla{r.total === 1 ? '' : 's'}{filtrado ? ' con el filtro' : ' en la biblioteca'} · más recientes primero</p>
          {!r.filas.length && (
            <Vacio icono="buscar" titulo="Ninguna plantilla coincide">
              <p>Pruebe con menos palabras o quite algún filtro.</p>
              {filtrado && <Link className="boton secundario" href={base}>Quitar los filtros</Link>}
            </Vacio>
          )}
          <ul className="lista-plantillas">
            {r.filas.map((p) => (
              <li key={p.id} className={p.id === ver ? 'elegida' : undefined}>
                <Link href={enlace(base, parametros, { ver: p.id })} scroll={false} aria-current={p.id === ver ? 'true' : undefined}>
                  <span className="nombre">{p.nombre}</span>
                  <span className="datos">
                    <span className="etiqueta dato">{p.categoria}</span>
                    {p.subcategoria && <span className="etiqueta dato">{p.subcategoria}</span>}
                    <span>{fecha(p.fecha, false)}</span>
                    {!p.activa && <span className="etiqueta advertencia">Retirada</span>}
                    {p.origen === 'REVISOR' && <span className="etiqueta informativa">Agregada por el revisor</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {r.paginas > 1 && (
            <nav className="paginacion" aria-label="Páginas de resultados">
              {r.pagina > 1 ? <Link className="boton secundario pequeno" href={enlace(base, parametros, { pagina: r.pagina - 1, ver: null })}><Icono nombre="atras" tamano={16} />Anterior</Link> : <span />}
              <span className="tenue">Página {r.pagina} de {r.paginas}</span>
              {r.pagina < r.paginas ? <Link className="boton secundario pequeno" href={enlace(base, parametros, { pagina: r.pagina + 1, ver: null })}>Siguiente<Icono nombre="adelante" tamano={16} /></Link> : <span />}
            </nav>
          )}
        </section>
        <aside className={`tarjeta vista-plantilla ${visible ? 'con-eleccion' : 'sin-eleccion'}`} aria-label="Vista previa de la plantilla">
          {!visible ? (
            <Vacio icono="ojo" titulo="Vista previa">
              <p>Elija una plantilla de la lista para verla completa aquí antes de usarla.</p>
            </Vacio>
          ) : (
            <>
              <div className="cerrar-vista">
                <Link className="boton fantasma" href={enlace(base, parametros, { ver: null })} scroll={false}><Icono nombre="atras" tamano={18} />Volver a los resultados</Link>
              </div>
              <div className="cabeza-vista">
                <div>
                  <h2>{visible.nombre}</h2>
                  <div className="datos">
                    <span className="etiqueta dato">{visible.categoria}</span>
                    {visible.subcategoria && <span className="etiqueta dato">{visible.subcategoria}</span>}
                    <span>Año {visible.anio} · modificada {fecha(visible.fecha, false)}{visible.cargadaPor && ` · agregada por ${visible.cargadaPor.nombreCompleto}`}</span>
                    {!visible.activa && <span className="etiqueta advertencia">Retirada</span>}
                  </div>
                </div>
                <a className="boton secundario pequeno" href={`/api/plantillas/${visible.id}`}><Icono nombre="descargar" tamano={16} />Descargar</a>
              </div>
              {acciones?.(visible)}
              <VisorDocx key={visible.id} url={`/api/plantillas/${visible.id}?vista=1`} />
            </>
          )}
        </aside>
      </div>
    </>
  );
}
