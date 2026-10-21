import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { ESQUEMAS } from '@/lib/escritura/esquemas';
import { vistaPreviaDocx, etiquetasDe } from '@/lib/escritura/vista-previa';
import { probarConEjemplo, type RevisionPlantilla } from '@/lib/servicios/revision-plantillas';
import { accionPlantilla, accionRevisarPlantilla } from '../acciones';
import { FormAdmin } from '../../admin/formularios';
import { fecha } from '../../componentes';
import { ESTADO_PLANTILLA, LeyendaPlantilla, PanelRevision, VistaDocumento } from '../componentes';

// La revisión de la IA puede tardar uno o dos minutos
export const maxDuration = 300;

const VISTAS = [['plantilla', 'Plantilla'], ['ejemplo', 'Con datos de ejemplo'], ['variables', 'Variables']] as const;

export default async function VersionPlantilla({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ vista?: string }> }) {
  const s = await requerirSesion({ roles: ['ADMINISTRADOR', 'REVISOR'] });
  const { id } = await params;
  const pedida = (await searchParams).vista;
  const vista = VISTAS.find(([v]) => v === pedida)?.[0] ?? 'plantilla';
  const p = await db.plantilla.findUnique({
    where: { id },
    include: {
      tipo: { include: { plantillas: { select: { id: true, version: true, estado: true }, orderBy: { version: 'desc' } } } },
      cargadaPor: { select: { nombreCompleto: true } },
      aprobadaPor: { select: { nombreCompleto: true } },
    },
  });
  if (!p) notFound();
  const archivo = Buffer.from(p.archivo);
  const revision = p.revision as RevisionPlantilla | null;
  const parrafos = vistaPreviaDocx(archivo);
  const etiquetas = etiquetasDe(parrafos);
  const ejemplo = vista === 'ejemplo' ? await probarConEjemplo(p.tipoId, archivo) : null;
  const admin = s.usuario.rol === 'ADMINISTRADOR';
  const esquema = ESQUEMAS[p.tipoId];

  return (
    <>
      <p><Link href="/plantillas">← Plantillas</Link></p>
      <div className="fila entre">
        <h1 style={{ marginBottom: 0 }}>{p.tipo.nombre}</h1>
        <span className={`etiqueta ${ESTADO_PLANTILLA[p.estado][0]}`}>v{p.version} {ESTADO_PLANTILLA[p.estado][1]}</span>
      </div>
      <p className="suave">{p.tipo.esBloque ? 'Bloque común de todas las escrituras' : p.tipo.categoria}{p.tipo.descripcion ? ` · ${p.tipo.descripcion}` : ''}</p>

      {p.tipo.plantillas.length > 1 && (
        <nav className="pestanas" aria-label="Versiones">
          {p.tipo.plantillas.map((v) => (
            <Link key={v.id} href={`/plantillas/${v.id}${vista !== 'plantilla' ? `?vista=${vista}` : ''}`} aria-current={v.id === p.id ? 'page' : undefined}>
              v{v.version} · {ESTADO_PLANTILLA[v.estado][1]}
            </Link>
          ))}
        </nav>
      )}

      <div className="detalle-plantilla">
        <div>
          <nav className="pestanas" aria-label="Vista">
            {VISTAS.map(([v, texto]) => <Link key={v} href={`/plantillas/${p.id}${v === 'plantilla' ? '' : `?vista=${v}`}`} aria-current={v === vista ? 'page' : undefined}>{texto}</Link>)}
          </nav>

          {vista === 'plantilla' && (
            <>
              <LeyendaPlantilla />
              <VistaDocumento parrafos={parrafos} />
              <p className="suave">Vista aproximada del texto: márgenes, encabezados y tablas se revisan en el .docx descargado.</p>
            </>
          )}

          {vista === 'ejemplo' && (!ejemplo
            ? <div className="aviso alerta">Aún no hay un caso de datos de ejemplo para este tipo de escritura, así que no se puede probar el llenado. Revise la plantilla en la pestaña «Plantilla».</div>
            : 'error' in ejemplo
              ? <div className="aviso error">{ejemplo.error}</div>
              : (
                <>
                  <div className="aviso info">Datos <strong>ficticios</strong> del caso «{ejemplo.caso.descripcion}». Se muestra solo esta parte de la escritura, llenada como lo haría el sistema.</div>
                  {ejemplo.faltantes.length > 0 && <div className="aviso error">El sistema no supo llenar: <code>{ejemplo.faltantes.join(', ')}</code>. Revise que esas variables estén bien escritas; si son nuevas, el sistema aún no las conoce.</div>}
                  <VistaDocumento parrafos={ejemplo.parrafos} />
                </>
              ))}

          {vista === 'variables' && (
            <div className="rejilla dos">
              <section className="tarjeta">
                <h2 style={{ marginTop: 0 }}>Variables ({etiquetas.variables.length})</h2>
                <ul className="lista-codigo">{etiquetas.variables.map((v) => <li key={v}><code>{`{{${v}}}`}</code>{revision?.automatica.nuevas.includes(v) && <> <span className="etiqueta advertencia">nueva</span></>}</li>)}</ul>
              </section>
              <section className="tarjeta">
                <h2 style={{ marginTop: 0 }}>Condiciones ({etiquetas.condiciones.length})</h2>
                <ul className="lista-codigo">{etiquetas.condiciones.map((v) => <li key={v}><code>{`{{#${v}}}`}</code>{revision?.automatica.nuevas.includes(v) && <> <span className="etiqueta advertencia">nueva</span></>}</li>)}</ul>
                {!!revision?.automatica.eliminadas.length && (
                  <>
                    <h3>Ya no aparecen (frente a v{revision.automatica.comparadaCon})</h3>
                    <ul className="lista-codigo">{revision.automatica.eliminadas.map((v) => <li key={v}><code>{v}</code></li>)}</ul>
                  </>
                )}
              </section>
            </div>
          )}
        </div>

        <aside>
          <section className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Revisión</h2>
            <PanelRevision revision={revision} revisadaEn={fecha(p.revisadaEn)} />
            <FormAdmin accion={accionRevisarPlantilla} ocultos={{ id: p.id }} botones={[{ texto: revision ? 'Revisar de nuevo con IA' : 'Revisar con IA', clase: 'secundario' }]}
              mensajePendiente="La IA está revisando la plantilla. Puede tardar uno o dos minutos." />
          </section>

          <section className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Versión {p.version}</h2>
            <p className="suave">
              {p.nombreArchivo}<br />
              Cargada {fecha(p.creadaEn)}{p.cargadaPor ? ` por ${p.cargadaPor.nombreCompleto}` : ''}<br />
              {p.aprobadaEn && <>Aprobada {fecha(p.aprobadaEn)}{p.aprobadaPor ? ` por ${p.aprobadaPor.nombreCompleto}` : ''}<br /></>}
              SHA-256 {p.hashSha256.slice(0, 16)}…
            </p>
            {p.notas && <p>{p.notas}</p>}
            {esquema && <p className="suave">Fuente: {esquema.plantillaFuente} · Reglas de cruce: {esquema.reglas.join(', ') || 'ninguna'}</p>}
            {p.tipo.normas && <p className="suave">{p.tipo.normas}</p>}
            <div className="fila">
              <a className="boton secundario pequeno" href={`/api/plantillas/${p.id}`}>Descargar .docx</a>
              <Link className="boton secundario pequeno" href={`/plantillas?tipo=${p.tipoId}`}>Cargar otra versión</Link>
            </div>
          </section>

          {p.estado !== 'RETIRADA' && (
            <section className="tarjeta">
              <h2 style={{ marginTop: 0 }}>Aprobación</h2>
              {!admin ? (
                <p className="suave">{p.estado === 'APROBADA' ? 'Es la versión vigente.' : 'La aprueba el administrador por indicación del notario, después de revisar el texto y los hallazgos.'}</p>
              ) : p.estado === 'PENDIENTE_APROBACION' ? (
                <>
                  {revision?.ia?.veredicto === 'NO_APTA' && <div className="aviso error">La IA la marcó como <strong>no apta</strong>. Revise los hallazgos con el notario antes de aprobar.</div>}
                  {!revision && <div className="aviso alerta">Esta versión aún no ha sido revisada.</div>}
                  <FormAdmin accion={accionPlantilla} ocultos={{ id: p.id }} campos={[{ nombre: 'confirmacion', etiqueta: 'Para aprobar escriba: APROBADA POR EL NOTARIO', ayuda: 'Apruebe solo después de que el notario haya revisado el texto de la plantilla.' }]}
                    botones={[{ operacion: 'aprobar', texto: 'Aprobar', clase: 'exito' }, { operacion: 'retirar', texto: 'Retirar', clase: 'secundario' }]} />
                </>
              ) : (
                <FormAdmin accion={accionPlantilla} ocultos={{ id: p.id }} botones={[{ operacion: 'retirar', texto: 'Retirar', clase: 'peligro' }]} confirmar={{ retirar: 'Sin una versión aprobada no se podrán generar borradores de este tipo. ¿Retirar?' }} />
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
