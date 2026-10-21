import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { ESQUEMAS } from '@/lib/escritura/esquemas';
import type { RevisionPlantilla } from '@/lib/servicios/revision-plantillas';
import { accionCargarPlantilla } from './acciones';
import { FormAdmin } from '../admin/formularios';
import { fecha } from '../componentes';
import { ESTADO_PLANTILLA, EtiquetaVeredicto } from './componentes';

// La carga incluye la revisión de la IA, que puede tardar uno o dos minutos
export const maxDuration = 300;

export default async function Plantillas({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const s = await requerirSesion({ roles: ['ADMINISTRADOR', 'REVISOR'] });
  const { tipo } = await searchParams;
  const tipos = await db.tipoEscritura.findMany({
    orderBy: [{ esBloque: 'desc' }, { categoria: 'asc' }, { nombre: 'asc' }],
    include: { plantillas: { select: { id: true, version: true, estado: true, creadaEn: true, revision: true }, orderBy: { version: 'desc' } } },
  });
  const conPlantilla = tipos.filter((t) => !t.esBloque && t.plantillas.length);
  const sinPlantilla = tipos.filter((t) => !t.esBloque && !t.plantillas.length);
  const pendientes = tipos.flatMap((t) => t.plantillas.filter((p) => p.estado === 'PENDIENTE_APROBACION').map((p) => ({ ...p, tipo: t })));
  const PRIORIDAD = { Alta: 0, Media: 1, Baja: 2 } as Record<string, number>;
  return (
    <>
      <h1>Plantillas</h1>
      <div className="aviso info">
        Abra cada plantilla para ver su texto con las variables resaltadas, probarla con datos de ejemplo y leer la revisión de la IA.
        Toda versión cargada queda <strong>pendiente de aprobación del notario</strong>; solo las aprobadas se usan para generar borradores.
        {s.usuario.rol === 'REVISOR' && ' La aprobación la hace el administrador por indicación del notario.'}
      </div>

      <section className="tarjeta">
        <div className="rejilla tres">
          <div><span className="cifra">{conPlantilla.filter((t) => t.plantillas.some((p) => p.estado === 'APROBADA')).length}</span><div className="suave">tipos con plantilla aprobada</div></div>
          <div><span className="cifra">{pendientes.length}</span><div className="suave">versiones pendientes de aprobación</div></div>
          <div><span className="cifra">{sinPlantilla.length}</span><div className="suave">tipos sin plantilla (la notaría debe entregarlas)</div></div>
        </div>
        <details><summary>Faltantes por prioridad ({sinPlantilla.length})</summary>
          <ul>{[...sinPlantilla].sort((a, b) => PRIORIDAD[a.prioridad] - PRIORIDAD[b.prioridad]).map((t) => <li key={t.id}><span className={`etiqueta ${t.prioridad === 'Alta' ? 'critica' : t.prioridad === 'Media' ? 'advertencia' : ''}`}>{t.prioridad}</span> {t.nombre} <span className="suave">· {t.categoria}</span></li>)}</ul>
        </details>
      </section>

      {pendientes.length > 0 && (
        <section className="tarjeta">
          <h2 style={{ marginTop: 0 }}>Pendientes de aprobación</h2>
          <table>
            <thead><tr><th>Plantilla</th><th>Versión</th><th>Cargada</th><th>Revisión</th></tr></thead>
            <tbody>{pendientes.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/plantillas/${p.id}`}>{p.tipo.nombre}</Link></td>
                <td>v{p.version}</td>
                <td>{fecha(p.creadaEn)}</td>
                <td><EtiquetaVeredicto revision={p.revision as RevisionPlantilla | null} /></td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Cargar nueva versión</h2>
        <p className="suave">Use variables <code>{'{{variable}}'}</code> y bloques condicionales <code>{'{{#condicion}} … {{/condicion}}'}</code>. Al cargarla, el sistema la prueba con datos de ejemplo y la IA la revisa.</p>
        <FormAdmin accion={accionCargarPlantilla} campos={[
          { nombre: 'tipoId', etiqueta: 'Tipo de escritura o bloque', tipo: 'select', opciones: tipos.map((t) => [t.id, `${t.esBloque ? '[Bloque] ' : ''}${t.nombre}`]), valor: tipo },
          { nombre: 'archivo', etiqueta: 'Archivo .docx con variables', tipo: 'archivo' },
          { nombre: 'notas', etiqueta: 'Notas de la versión', tipo: 'area', ayuda: 'Qué cambió y por qué (la IA también lo lee).' },
        ]} botones={[{ texto: 'Cargar y revisar con IA' }]}
        mensajePendiente="Cargando la plantilla y revisándola con la IA. Puede tardar uno o dos minutos; no cierre esta página." />
      </section>

      <table>
        <thead><tr><th>Tipo</th><th>Vigente</th><th>Otras versiones</th><th>Formulario</th></tr></thead>
        <tbody>{tipos.filter((t) => t.esBloque || t.plantillas.length).map((t) => {
          const vigente = t.plantillas.find((p) => p.estado === 'APROBADA');
          return (
            <tr key={t.id}>
              <td><strong>{t.nombre}</strong><div className="suave">{t.esBloque ? 'Bloque común' : `${t.categoria} · prioridad ${t.prioridad.toLowerCase()}`}</div></td>
              <td>{vigente ? <Link href={`/plantillas/${vigente.id}`}>Ver v{vigente.version}</Link> : <span className="etiqueta critica">sin aprobada</span>}</td>
              <td>{t.plantillas.filter((p) => p !== vigente).map((p) => (
                <div key={p.id}><Link href={`/plantillas/${p.id}`}>v{p.version}</Link> <span className={`etiqueta ${ESTADO_PLANTILLA[p.estado][0]}`}>{ESTADO_PLANTILLA[p.estado][1]}</span></div>
              ))}</td>
              <td>{ESQUEMAS[t.id] ? `${ESQUEMAS[t.id].pasos.reduce((n, p) => n + p.campos.length, 0)} campos` : t.esBloque ? '—' : 'sin esquema'}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </>
  );
}
