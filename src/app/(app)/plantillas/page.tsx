import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import type { RevisionPlantilla } from '@/lib/servicios/revision-plantillas';
import { accionCargarPlantilla } from './acciones';
import { FormAdmin } from '../admin/formularios';
import { fecha } from '../componentes';
import { EtiquetaVeredicto } from './componentes';

// La carga incluye la revisión de la IA, que puede tardar uno o dos minutos
export const maxDuration = 300;

const PESTANAS = { '': 'Todas', pendiente: 'Pendientes de aprobación', aprobada: 'Aprobadas', sin_plantilla: 'Sin plantilla' } as const;
type Filtro = keyof typeof PESTANAS;
const sinTildes = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PRIORIDAD = { Alta: 0, Media: 1, Baja: 2 } as Record<string, number>;
const clasePrioridad = (p: string) => (p === 'Alta' ? 'critica' : p === 'Media' ? 'advertencia' : '');

export default async function Plantillas({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; nuevo?: string }> }) {
  const s = await requerirSesion({ roles: ['ADMINISTRADOR', 'REVISOR'] });
  const { q = '', estado = '', nuevo } = await searchParams;
  const filtro: Filtro = estado in PESTANAS ? (estado as Filtro) : '';
  const tipos = await db.tipoEscritura.findMany({
    orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
    include: { plantillas: { select: { id: true, version: true, estado: true, creadaEn: true, revision: true }, orderBy: { version: 'desc' } } },
  });

  const cumple = (t: (typeof tipos)[number], f: Filtro) =>
    f === '' ? true
      : f === 'sin_plantilla' ? !t.plantillas.length
      : f === 'pendiente' ? t.plantillas.some((p) => p.estado === 'PENDIENTE_APROBACION')
      : t.plantillas.some((p) => p.estado === 'APROBADA');
  const busqueda = sinTildes(q.trim());
  const filas = tipos.filter((t) => cumple(t, filtro) && (!busqueda || sinTildes(`${t.nombre} ${t.categoria} ${t.esBloque ? 'bloque parte comun' : ''}`).includes(busqueda)));
  // Sin plantilla: primero lo más urgente para la notaría
  if (filtro === 'sin_plantilla') filas.sort((a, b) => PRIORIDAD[a.prioridad] - PRIORIDAD[b.prioridad] || a.nombre.localeCompare(b.nombre));
  const grupos = [
    { titulo: 'Escrituras', filas: filas.filter((t) => !t.esBloque) },
    { titulo: 'Partes comunes de todas las escrituras (carátula, cierre, oficios)', filas: filas.filter((t) => t.esBloque) },
  ].filter((g) => g.filas.length);

  // Las nuevas versiones de una plantilla existente se cargan dentro de ella; aquí solo las que faltan
  const cargables = tipos.filter((t) => !t.plantillas.length).sort((a, b) => Number(b.esBloque) - Number(a.esBloque) || PRIORIDAD[a.prioridad] - PRIORIDAD[b.prioridad] || a.nombre.localeCompare(b.nombre));
  const enlace = (f: Filtro) => `/plantillas?${new URLSearchParams({ ...(f ? { estado: f } : {}), ...(q ? { q } : {}) })}`;

  return (
    <>
      <div className="fila entre">
        <div>
          <h1 style={{ marginBottom: '0.25rem' }}>Plantillas</h1>
          <p className="suave" style={{ marginTop: 0 }}>
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

      <div className="fila entre barra-filtros">
        <nav className="pestanas" aria-label="Filtrar por estado">
          {(Object.keys(PESTANAS) as Filtro[]).map((f) => (
            <Link key={f} href={enlace(f)} aria-current={f === filtro ? 'page' : undefined}>
              {PESTANAS[f]} <span className="conteo">{tipos.filter((t) => cumple(t, f)).length}</span>
            </Link>
          ))}
        </nav>
        <form className="fila buscador" method="get">
          {filtro && <input type="hidden" name="estado" value={filtro} />}
          <input name="q" type="search" defaultValue={q} placeholder="Buscar (p. ej. compraventa)" aria-label="Buscar tipo de escritura" />
          <button type="submit" className="secundario pequeno">Buscar</button>
          {q && <Link className="pequeno" href={enlace(filtro).replace(/[?&]q=[^&]*/, '')}>Limpiar</Link>}
        </form>
      </div>

      {!grupos.length ? <section className="tarjeta suave">Ninguna plantilla coincide{q ? ` con «${q}»` : ''}.</section> : (
        <table className="tabla-plantillas">
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
                    <td>
                      {principal ? <Link href={`/plantillas/${principal.id}`}><strong>{t.nombre}</strong></Link> : <strong>{t.nombre}</strong>}
                      <div className="suave">{t.esBloque ? 'Parte común' : t.categoria}</div>
                    </td>
                    <td>
                      {!principal && <span className={`etiqueta ${clasePrioridad(t.prioridad)}`}>Sin plantilla · prioridad {t.prioridad.toLowerCase()}</span>}
                      {vigente && <div><span className="etiqueta ok">Aprobada v{vigente.version}</span></div>}
                      {pendiente && <div><span className="etiqueta advertencia">Pendiente v{pendiente.version}</span></div>}
                      {principal && !vigente && !pendiente && <span className="etiqueta">No aprobada</span>}
                    </td>
                    <td>{principal ? <EtiquetaVeredicto revision={principal.revision as RevisionPlantilla | null} /> : <span className="suave">—</span>}</td>
                    <td className="suave">{principal ? fecha(principal.creadaEn, false) : '—'}</td>
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
        </table>
      )}
    </>
  );
}
