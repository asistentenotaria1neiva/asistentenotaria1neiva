/**
 * Buscador de la biblioteca de plantillas (servidor): filtros por texto, categoría, subcategoría, año y
 * fecha; la lista de resultados y, al lado, la vista previa de la plantilla elegida (?ver=id) con las
 * acciones que pasa cada página (usar la plantilla, editarla…).
 */
import Link from 'next/link';
import type { SesionActiva } from '@/lib/sesion-tipos';
import { buscarPlantillas, opcionesFiltro, obtenerPlantilla, filtroDesdeParametros } from '@/lib/servicios/plantillas';
import { fecha } from '../componentes';
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
  return (
    <>
      <FiltrosPlantillas
        base={base}
        valores={{ q: filtro.q ?? '', categoria: filtro.categoria ?? '', subcategoria: filtro.subcategoria ?? '', anio: filtro.anio ? String(filtro.anio) : '', desde: typeof parametros.desde === 'string' ? parametros.desde : '', hasta: typeof parametros.hasta === 'string' ? parametros.hasta : '', retiradas: filtro.retiradas ?? false }}
        categorias={opciones.categorias}
        anios={opciones.anios}
        administrar={administrar}
      />
      <div className="biblioteca">
        <section className="tarjeta resultados-plantillas" aria-label="Plantillas encontradas">
          <p className="suave" aria-live="polite">{r.total.toLocaleString('es-CO')} plantilla(s){filtrado ? ' con el filtro aplicado' : ' en la biblioteca'} · más recientes primero</p>
          {!r.filas.length && <p className="suave vacio">Ninguna plantilla coincide. Pruebe con menos palabras o quite algún filtro.</p>}
          <ul className="lista-plantillas">
            {r.filas.map((p) => (
              <li key={p.id} className={p.id === ver ? 'elegida' : undefined}>
                <Link href={enlace(base, parametros, { ver: p.id })} scroll={false} aria-current={p.id === ver ? 'true' : undefined}>
                  <strong>{p.nombre}</strong>
                  <span className="suave">
                    {p.categoria}{p.subcategoria ? ` · ${p.subcategoria}` : ''} · {fecha(p.fecha, false)}
                    {!p.activa && <> · <span className="etiqueta advertencia">retirada</span></>}
                    {p.origen === 'REVISOR' && <> · <span className="etiqueta informativa">agregada por el revisor</span></>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {r.paginas > 1 && (
            <nav className="paginacion" aria-label="Páginas de resultados">
              {r.pagina > 1 ? <Link className="boton secundario pequeno" href={enlace(base, parametros, { pagina: r.pagina - 1, ver: null })}>Anterior</Link> : <span />}
              <span className="suave">Página {r.pagina} de {r.paginas}</span>
              {r.pagina < r.paginas ? <Link className="boton secundario pequeno" href={enlace(base, parametros, { pagina: r.pagina + 1, ver: null })}>Siguiente</Link> : <span />}
            </nav>
          )}
        </section>
        <aside className="tarjeta vista-plantilla" aria-label="Vista previa">
          {!visible ? (
            <p className="suave vacio">Elija una plantilla de la lista para verla aquí antes de usarla.</p>
          ) : (
            <>
              <div className="fila entre">
                <div>
                  <h2>{visible.nombre}</h2>
                  <p className="suave">
                    {visible.categoria}{visible.subcategoria ? ` · ${visible.subcategoria}` : ''} · año {visible.anio} · modificada {fecha(visible.fecha, false)}
                    {visible.cargadaPor && ` · agregada por ${visible.cargadaPor.nombreCompleto}`}
                  </p>
                </div>
                <a className="boton secundario pequeno" href={`/api/plantillas/${visible.id}`}>Descargar</a>
              </div>
              {acciones?.(visible)}
              <VisorDocx url={`/api/plantillas/${visible.id}?vista=1`} />
            </>
          )}
        </aside>
      </div>
    </>
  );
}
