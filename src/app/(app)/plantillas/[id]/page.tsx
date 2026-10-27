import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { ESQUEMAS } from '@/lib/escritura/esquemas';
import { vistaPreviaDocx, etiquetasDe } from '@/lib/escritura/vista-previa';
import { probarConEjemplo, tieneDatosReales, tieneEjemplo, valoresEjemploDe, type RevisionPlantilla } from '@/lib/servicios/revision-plantillas';
import type { Variabilizacion } from '@/lib/servicios/variabilizar-plantilla';
import { estadoCorreccionPlantilla } from '@/lib/servicios/correccion-plantillas';
import { accionCargarPlantilla, accionPlantilla, accionRevisarPlantilla, accionProponerCorreccionesPlantilla, accionAplicarCorreccionesPlantilla } from '../acciones';
import { FormAdmin } from '../../admin/formularios';
import { PanelCorreccionIA, RefrescoAutomatico } from '../../expedientes/formularios';
import { fecha } from '../../componentes';
import { CATEGORIA, ESTADO_PLANTILLA, LeyendaPlantilla, PanelConversion, PanelRevision, VistaDocumento, hallazgosOrdenados } from '../componentes';

const TEXTOS_CORRECCION = {
  seleccion: 'Elija los hallazgos que quiere arreglar. La IA propone cada cambio de texto; usted decide cuáles aplicar. Se crea una versión nueva, pendiente de aprobación: esta no cambia.',
  propuesta: 'Al aplicar se crea una versión nueva de la plantilla, pendiente de aprobación del notario; esta versión no cambia.',
  sinCorreccion: 'Se corrigen a mano en Word',
};
import { VisorDocx } from '../VisorDocx';
import { ConvertirDatosReales } from '../convertir';

// La revisión de la IA puede tardar uno o dos minutos
export const maxDuration = 300;

const VISTAS = [['diseno', 'Diseño (como en Word)'], ['ejemplo', 'Con datos de ejemplo'], ['texto', 'Solo texto'], ['variables', 'Variables']] as const;

export default async function VersionPlantilla({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ vista?: string; corregida?: string }> }) {
  const s = await requerirSesion({ roles: ['ADMINISTRADOR', 'REVISOR'] });
  const { id } = await params;
  const { vista: pedida, corregida } = await searchParams;
  const vista = VISTAS.find(([v]) => v === pedida)?.[0] ?? 'diseno';
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
  const conversion = p.variabilizacion as Variabilizacion | null;
  const ejemplo = vista === 'ejemplo' ? await probarConEjemplo(p.tipoId, archivo, valoresEjemploDe(p)) : null;
  const admin = s.usuario.rol === 'ADMINISTRADOR';
  const conEjemplo = tieneEjemplo(p.tipoId, valoresEjemploDe(p));
  const esquema = ESQUEMAS[p.tipoId];
  // Solo en la última versión: si ya hay una más nueva, la conversión se hace sobre esa
  const conDatosReales = !!process.env.ANTHROPIC_API_KEY && p.estado !== 'RETIRADA' && p.tipo.plantillas[0]?.id === p.id && tieneDatosReales(p);

  // Corrección con IA de los hallazgos: elegir → la IA propone (en segundo plano) → aplicar en una versión nueva
  const hallazgos = hallazgosOrdenados(revision);
  const corregible = !!process.env.ANTHROPIC_API_KEY && p.estado !== 'RETIRADA' && hallazgos.length > 0;
  const correccion = corregible ? await estadoCorreccionPlantilla(p.id) : null;
  const propuesta = correccion?.estado === 'COMPLETADA' && (correccion.propuestas.some((x) => x.estado === 'PENDIENTE') || correccion.sinCorreccion.length > 0) ? correccion : null;
  const enCurso = correccion?.estado === 'EN_CURSO';
  const mensajeHallazgo = (i: number) => revision?.ia?.hallazgos[i]?.mensaje ?? 'Hallazgo';
  const nuevaVersion = correccion?.nuevaVersionId ? p.tipo.plantillas.find((v) => v.id === correccion.nuevaVersionId) : undefined;

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
            <Link key={v.id} href={`/plantillas/${v.id}${vista !== 'diseno' ? `?vista=${vista}` : ''}`} aria-current={v.id === p.id ? 'page' : undefined}>
              v{v.version} · {ESTADO_PLANTILLA[v.estado][1]}
            </Link>
          ))}
        </nav>
      )}

      <div className="detalle-plantilla">
        <div>
          <nav className="pestanas" aria-label="Vista">
            {VISTAS.map(([v, texto]) => <Link key={v} href={`/plantillas/${p.id}${v === 'diseno' ? '' : `?vista=${v}`}`} aria-current={v === vista ? 'page' : undefined}>{texto}</Link>)}
          </nav>

          <div className="fila descargas">
            <a className="boton pequeno" href={`/api/plantillas/${p.id}`}>Descargar plantilla sin datos (.docx)</a>
            {conEjemplo && <a className="boton secundario pequeno" href={`/api/plantillas/${p.id}?ejemplo=1`}>Descargar con datos de ejemplo (.docx)</a>}
            <span className="suave">Ábralos en Word para confirmar márgenes, fuentes y saltos de página exactos.</span>
          </div>

          {vista === 'diseno' && (
            <>
              <LeyendaPlantilla />
              <VisorDocx url={`/api/plantillas/${p.id}?vista=1`} />
            </>
          )}

          {vista === 'texto' && (
            <>
              <LeyendaPlantilla />
              <VistaDocumento parrafos={parrafos} />
              <p className="suave">Solo el texto del cuerpo, con todas las variables resaltadas. El diseño completo está en la pestaña «Diseño».</p>
            </>
          )}

          {vista === 'ejemplo' && (!ejemplo
            ? <div className="aviso alerta">Aún no hay un caso de datos de ejemplo para este tipo de escritura, así que no se puede probar el llenado. Revise el diseño en la pestaña «Diseño».</div>
            : 'error' in ejemplo
              ? <div className="aviso error">{ejemplo.error}</div>
              : (
                <>
                  <div className="aviso info">
                    {ejemplo.caso.clave === 'conversion_ia'
                      ? <>Datos <strong>ficticios</strong> que propuso la IA al convertir el caso real en plantilla (el tipo aún no tiene caso de ejemplo).</>
                      : <>Datos <strong>ficticios</strong> del caso «{ejemplo.caso.descripcion}»{conversion?.reemplazos.length ? ', completados con los que propuso la IA al convertir el caso real' : ''}.</>}
                    {' '}Se muestra solo esta parte de la escritura, llenada como lo haría el sistema.
                  </div>
                  {ejemplo.deMuestra.length > 0 && <div className="aviso alerta">El caso de ejemplo no trae {ejemplo.deMuestra.length === 1 ? 'esta variable' : `estas ${ejemplo.deMuestra.length} variables`}, así que se llenaron con valores genéricos de muestra: <code>{ejemplo.deMuestra.join(', ')}</code>. Para generar escrituras reales con esta plantilla, el formulario del expediente debe pedir esos datos.</div>}
                  {ejemplo.faltantes.length > 0 && <div className="aviso error">El sistema no supo llenar: <code>{ejemplo.faltantes.join(', ')}</code>. Revise que esas etiquetas estén bien escritas.</div>}
                  <VisorDocx url={`/api/plantillas/${p.id}?ejemplo=1&vista=1`} />
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
            {corregida && <div className="aviso info">Esta versión se creó con las correcciones de la IA (ver notas abajo). Revísela con la IA y en Word antes de aprobarla.</div>}
            <PanelRevision revision={revision} revisadaEn={fecha(p.revisadaEn)} ocultarHallazgos={corregible && !propuesta && !enCurso} />
            <FormAdmin accion={accionRevisarPlantilla} ocultos={{ id: p.id }} botones={[{ texto: revision ? 'Revisar de nuevo con IA' : 'Revisar con IA', clase: 'secundario' }]}
              mensajePendiente="La IA está revisando la plantilla. Puede tardar uno o dos minutos." />
          </section>

          {conDatosReales && (
            <section className="tarjeta">
              <h2 style={{ marginTop: 0 }}>Datos de un caso real</h2>
              <p className="suave">La revisión encontró datos de un caso real escritos en esta versión. La IA puede cambiarlos por variables: se crea la v{Math.max(...p.tipo.plantillas.map((v) => v.version)) + 1}, sin datos y con su vista con datos de ejemplo ficticios, pendiente de aprobación. Esta versión no cambia.</p>
              <ConvertirDatosReales compacto plantillas={[{ id: p.id, nombre: p.tipo.nombre, version: p.version }]} />
            </section>
          )}

          {conversion && <PanelConversion conversion={conversion} />}

          {corregible && (
            <section className="tarjeta">
              {enCurso && <RefrescoAutomatico />}
              {nuevaVersion && !propuesta && !enCurso && (
                <div className="aviso exito">Las últimas correcciones se aplicaron en la <Link href={`/plantillas/${nuevaVersion.id}`}>versión {nuevaVersion.version}</Link>.</div>
              )}
              <PanelCorreccionIA textos={TEXTOS_CORRECCION}
                proponer={accionProponerCorreccionesPlantilla.bind(null, p.id)}
                observaciones={hallazgos.map((h) => ({ id: String(h.indice), nivel: h.nivel, mensaje: h.mensaje, categoria: CATEGORIA[h.categoria] ?? h.categoria, detalle: h.fragmento ?? undefined }))}
                enCurso={enCurso ? fecha(new Date(correccion!.iniciadaEn)) : undefined}
                error={correccion?.estado === 'ERROR' ? correccion.error : undefined}
                {...(propuesta ? {
                  aplicar: accionAplicarCorreccionesPlantilla.bind(null, p.id),
                  propuesta: {
                    id: propuesta.iniciadaEn,
                    fecha: fecha(new Date(propuesta.iniciadaEn)),
                    propuestas: propuesta.propuestas.flatMap((x, indice) => (x.estado === 'PENDIENTE' ? [{
                      indice, observacion: mensajeHallazgo(x.hallazgo), etiqueta: CATEGORIA[revision?.ia?.hallazgos[x.hallazgo]?.categoria ?? ''] ?? 'Cambio de texto',
                      antes: x.original, despues: x.corregido, explicacion: x.explicacion, fuente: '',
                    }] : [])),
                    sinCorreccion: propuesta.sinCorreccion.map((x) => ({ observacion: mensajeHallazgo(x.hallazgo), motivo: x.motivo })),
                  },
                } : {})} />
            </section>
          )}

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
          </section>

          <section className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Cargar nueva versión</h2>
            <p className="suave">Será la v{Math.max(...p.tipo.plantillas.map((v) => v.version)) + 1} de esta plantilla y quedará pendiente de aprobación. Si es la escritura de un caso real, la IA cambia sus datos por variables. El sistema la prueba con datos de ejemplo y la IA la revisa.</p>
            <FormAdmin accion={accionCargarPlantilla} ocultos={{ tipoId: p.tipoId }} campos={[
              { nombre: 'archivo', etiqueta: 'Archivo .docx con variables', tipo: 'archivo' },
              { nombre: 'notas', etiqueta: 'Notas de la versión', tipo: 'area', ayuda: 'Qué cambió y por qué (la IA también lo lee).' },
            ]} botones={[{ texto: 'Cargar y revisar con IA' }]}
            mensajePendiente="Cargando la versión y revisándola con la IA. Puede tardar uno o dos minutos; no cierre esta página." />
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
