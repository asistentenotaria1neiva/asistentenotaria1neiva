import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import type { RevisionPlantilla } from '@/lib/servicios/revision-plantillas';
import { accionCargarPlantilla } from './acciones';
import { FormAdmin } from '../admin/formularios';
import { Tabla, fecha } from '../componentes';
import { EtiquetaVeredicto } from './componentes';
import { FiltrosPlantillas } from './filtros';

// La carga incluye la revisión de la IA, que puede tardar uno o dos minutos
export const maxDuration = 300;

const PESTANAS = { '': 'Todas', pendiente: 'Pendientes de aprobación', aprobada: 'Aprobadas', sin_plantilla: 'Sin plantilla' } as const;
type Filtro = keyof typeof PESTANAS;
const sinTildes = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PRIORIDAD = { Alta: 0, Media: 1, Baja: 2 } as Record<string, number>;
const clasePrioridad = (p: string) => (p === 'Alta' ? 'critica' : p === 'Media' ? 'advertencia' : '');

type Parametros = { q?: string; estado?: string; categoria?: string; prioridad?: string; ia?: string; orden?: string; nuevo?: string };

export default async function Plantillas({ searchParams }: { searchParams: Promise<Parametros> }) {
  const s = await requerirSesion({ roles: ['ADMINISTRADOR', 'REVISOR'] });
  const { q = '', estado = '', categoria = '', prioridad = '', ia = '', orden = '', nuevo } = await searchParams;
  const filtro: Filtro = estado in PESTANAS ? (estado as Filtro) : '';
  const tipos = await db.tipoEscritura.findMany({
    orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
    include: { plantillas: { select: { id: true, version: true, estado: true, creadaEn: true, revision: true }, orderBy: { version: 'desc' } } },
  });
  type Tipo = (typeof tipos)[number];
  // La versión que representa al tipo en la lista: la pendiente, si no la vigente, si no la última
  const principalDe = (t: Tipo) => t.plantillas.find((p) => p.estado === 'PENDIENTE_APROBACION') ?? t.plantillas.find((p) => p.estado === 'APROBADA') ?? t.plantillas[0];

  const cumple = (t: Tipo, f: Filtro) =>
    f === '' ? true
      : f === 'sin_plantilla' ? !t.plantillas.length
      : f === 'pendiente' ? t.plantillas.some((p) => p.estado === 'PENDIENTE_APROBACION')
      : t.plantillas.some((p) => p.estado === 'APROBADA');
  const veredicto = (t: Tipo) => {
    const p = principalDe(t);
    if (!p) return 'sin_plantilla';
    const r = p.revision as RevisionPlantilla | null;
    return !r?.ia ? 'sin_revisar' : r.ia.veredicto === 'APTA' ? 'apta' : r.ia.veredicto === 'NO_APTA' ? 'no_apta' : 'observaciones';
  };
  const busqueda = sinTildes(q.trim());
  // Todos los filtros salvo el de estado: así cada pestaña muestra cuántas quedan con los demás filtros aplicados
  const pasaFiltros = (t: Tipo) =>
    (!busqueda || sinTildes(`${t.nombre} ${t.categoria} ${t.descripcion ?? ''} ${t.esBloque ? 'bloque parte comun' : ''}`).includes(busqueda))
    && (!categoria || t.categoria === categoria)
    && (!prioridad || t.prioridad === prioridad)
    && (!ia || veredicto(t) === ia);
  const filas = tipos.filter((t) => cumple(t, filtro) && pasaFiltros(t));

  const ultimaCarga = (t: Tipo) => principalDe(t)?.creadaEn.getTime() ?? 0;
  const porPrioridad = (a: Tipo, b: Tipo) => PRIORIDAD[a.prioridad] - PRIORIDAD[b.prioridad] || a.nombre.localeCompare(b.nombre);
  if (orden === 'nombre') filas.sort((a, b) => a.nombre.localeCompare(b.nombre));
  else if (orden === 'reciente') filas.sort((a, b) => ultimaCarga(b) - ultimaCarga(a) || a.nombre.localeCompare(b.nombre));
  else if (orden === 'prioridad' || filtro === 'sin_plantilla') filas.sort(porPrioridad); // sin plantilla: primero lo más urgente
  // Por categoría se agrupa; con otro orden la lista es una sola
  // Las categorías de escrituras en orden (A, B, C…) y la de las partes comunes siempre al final
  const esComun = (c: string) => tipos.some((t) => t.categoria === c && t.esBloque);
  const categorias = [...new Set(tipos.map((t) => t.categoria))].sort((a, b) => Number(esComun(a)) - Number(esComun(b)) || a.localeCompare(b));
  const grupos = orden && orden !== 'categoria'
    ? [{ titulo: 'Resultados', filas }].filter((g) => g.filas.length)
    : categorias.map((c) => ({ titulo: c === 'Bloques comunes' ? 'Partes comunes de todas las escrituras (carátula, cierre, oficios)' : c, filas: filas.filter((t) => t.categoria === c) })).filter((g) => g.filas.length);
  const filtrosActivos = !!(q || categoria || prioridad || ia || orden);

  // Las nuevas versiones de una plantilla existente se cargan dentro de ella; aquí solo las que faltan
  const cargables = tipos.filter((t) => !t.plantillas.length).sort((a, b) => Number(b.esBloque) - Number(a.esBloque) || PRIORIDAD[a.prioridad] - PRIORIDAD[b.prioridad] || a.nombre.localeCompare(b.nombre));
  const enlace = (f: Filtro) => `/plantillas?${new URLSearchParams(Object.entries({ estado: f, q, categoria, prioridad, ia, orden }).filter(([, v]) => v))}`;

  return (
    <>
      <div className="encabezado">
        <div>
          <h1>Plantillas</h1>
          <p className="suave">
            Abra una plantilla para ver su diseño, probarla con datos de ejemplo, leer la revisión de la IA o cargar una nueva versión.
            Solo las versiones aprobadas se usan para generar borradores{s.usuario.rol === 'REVISOR' ? '; las aprueba el administrador por indicación del notario' : ''}.
          </p>
        </div>
      </div>

      {cargables.length > 0 && (
        <details className="tarjeta carga-nueva" id="cargar" open={!!nuevo}>
          <summary>+ Cargar plantilla nueva <span className="suave">({cargables.length} tipos aún no tienen plantilla)</span></summary>
          <p className="suave">
            Use variables <code>{'{{variable}}'}</code> y bloques condicionales <code>{'{{#condicion}} … {{/condicion}}'}</code>.
            Al cargarla, el sistema la prueba con datos de ejemplo y la IA la revisa; queda pendiente de aprobación.
          </p>
          <FormAdmin accion={accionCargarPlantilla} campos={[
            { nombre: 'tipoId', etiqueta: 'Tipo de escritura', tipo: 'select', valor: nuevo, opciones: cargables.map((t) => [t.id, t.esBloque ? `[Parte común] ${t.nombre}` : `${t.nombre} · prioridad ${t.prioridad.toLowerCase()}`]) },
            { nombre: 'archivo', etiqueta: 'Archivo .docx con variables', tipo: 'archivo' },
            { nombre: 'notas', etiqueta: 'Notas', tipo: 'area', ayuda: 'Origen de la plantilla u observaciones (la IA también lo lee).' },
          ]} botones={[{ texto: 'Cargar y revisar con IA' }]}
          mensajePendiente="Cargando la plantilla y revisándola con la IA. Puede tardar uno o dos minutos; no cierre esta página." />
        </details>
      )}

      <FiltrosPlantillas valores={{ q, estado: filtro, categoria, prioridad, ia, orden }} activos={filtrosActivos}
        categorias={categorias.map((c) => [c, c === 'Bloques comunes' ? 'Partes comunes' : c])} />

      <div className="fila entre barra-filtros">
        <nav className="pestanas" aria-label="Filtrar por estado">
          {(Object.keys(PESTANAS) as Filtro[]).map((f) => (
            <Link key={f} href={enlace(f)} aria-current={f === filtro ? 'page' : undefined}>
              {PESTANAS[f]} <span className="conteo">{tipos.filter((t) => cumple(t, f) && pasaFiltros(t)).length}</span>
            </Link>
          ))}
        </nav>
        <span className="suave">{filas.length === tipos.length ? `${tipos.length} tipos de escritura` : `${filas.length} de ${tipos.length} tipos de escritura`}</span>
      </div>

      {!grupos.length ? (
        <section className="tarjeta suave vacio">
          Ninguna plantilla coincide{q ? ` con «${q}»` : ''} con los filtros elegidos.{' '}
          {(filtrosActivos || filtro) && <Link href="/plantillas">Ver todas</Link>}
        </section>
      ) : (
        <Tabla className="tabla-plantillas">
          <thead><tr><th>Plantilla</th><th>Estado</th><th>Revisión IA</th><th>Última carga</th><th aria-label="Acciones" /></tr></thead>
          {grupos.map((g) => (
            <tbody key={g.titulo}>
              <tr className="grupo"><th colSpan={5}>{g.titulo} <span className="suave">({g.filas.length})</span></th></tr>
              {g.filas.map((t) => {
                const vigente = t.plantillas.find((p) => p.estado === 'APROBADA');
                const pendiente = t.plantillas.find((p) => p.estado === 'PENDIENTE_APROBACION');
                const principal = pendiente ?? vigente ?? t.plantillas[0];
                return (
                  <tr key={t.id}>
                    <td className="principal-celda">
                      {principal ? <Link href={`/plantillas/${principal.id}`}><strong>{t.nombre}</strong></Link> : <strong>{t.nombre}</strong>}
                      <div className="suave">{t.esBloque ? 'Parte común' : t.categoria} · prioridad {t.prioridad.toLowerCase()}</div>
                    </td>
                    <td data-etiqueta="Estado">
                      <div className="fila" style={{ gap: '0.3rem' }}>
                        {!principal && <span className={`etiqueta ${clasePrioridad(t.prioridad)}`}>Sin plantilla · prioridad {t.prioridad.toLowerCase()}</span>}
                        {vigente && <span className="etiqueta ok">Aprobada v{vigente.version}</span>}
                        {pendiente && <span className="etiqueta advertencia">Pendiente v{pendiente.version}</span>}
                        {principal && !vigente && !pendiente && <span className="etiqueta">No aprobada</span>}
                      </div>
                    </td>
                    <td data-etiqueta="Revisión IA" className={principal ? undefined : 'sin-dato'}>{principal ? <EtiquetaVeredicto revision={principal.revision as RevisionPlantilla | null} /> : <span className="suave">—</span>}</td>
                    <td data-etiqueta="Última carga" className={principal ? 'suave' : 'suave sin-dato'}>{principal ? fecha(principal.creadaEn, false) : '—'}</td>
                    <td className="acciones">
                      {principal ? (
                        <>
                          <Link className="boton pequeno" href={`/plantillas/${principal.id}`}>Abrir</Link>
                          <a className="boton secundario pequeno" href={`/api/plantillas/${principal.id}`}>Descargar</a>
                        </>
                      ) : <Link className="boton secundario pequeno" href={`/plantillas?nuevo=${t.id}#cargar`}>Cargar</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </Tabla>
      )}
    </>
  );
}
