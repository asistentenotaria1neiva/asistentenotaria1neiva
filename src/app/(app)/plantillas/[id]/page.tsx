import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { ESQUEMAS } from '@/lib/escritura/esquemas';
import { vistaPreviaDocx } from '@/lib/escritura/vista-previa';
import { enRevision, type RevisionPlantilla } from '@/lib/servicios/revision-plantillas';
import { estadoCorreccionPlantilla } from '@/lib/servicios/correccion-plantillas';
import { nombreVariante } from '@/lib/servicios/plantillas';
import { accionCargarPlantilla, accionPlantilla, accionEliminarPlantilla, accionRevisarPlantilla, accionProponerCorreccionesPlantilla, accionAplicarCorreccionesPlantilla, accionVariante, accionAprobarVariantes, accionCambiarVariantes } from '../acciones';import { FormAdmin } from '../../admin/formularios';
import { PanelCorreccionIA, RefrescoAutomatico } from '../../expedientes/formularios';
import { fecha } from '../../componentes';
import { CATEGORIA, ESTADO_PLANTILLA, PanelRevision, VistaDocumento, hallazgosOrdenados } from '../componentes';

const TEXTOS_CORRECCION = {
  seleccion: 'Elija los hallazgos que quiere arreglar. La IA propone cada cambio de texto; usted decide cuáles aplicar. Se crea una versión nueva, pendiente de aprobación: esta no cambia.',
  propuesta: 'Al aplicar se crea una versión nueva de la plantilla, pendiente de aprobación del notario; esta versión no cambia.',
  sinCorreccion: 'Se corrigen a mano en Word',
};
import { VisorDocx } from '../VisorDocx';
import { TablaVariantes } from './variantes';

// La revisión de la IA puede tardar uno o dos minutos
export const maxDuration = 300;

const VISTAS = [['diseno', 'Diseño (como en Word)'], ['texto', 'Solo texto']] as const;

export default async function VersionPlantilla({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ vista?: string; corregida?: string }> }) {
  const s = await requerirSesion({ roles: ['ADMINISTRADOR', 'REVISOR'] });
  const { id } = await params;
  const { vista: pedida, corregida } = await searchParams;
  const vista = VISTAS.find(([v]) => v === pedida)?.[0] ?? 'diseno';
  const p = await db.plantilla.findUnique({
    where: { id },
    include: {
      tipo: { include: { plantillas: { select: { id: true, version: true, estado: true, variante: true, nombreArchivo: true, criterios: true }, orderBy: { version: 'desc' } } } },
      cargadaPor: { select: { nombreCompleto: true } },
      aprobadaPor: { select: { nombreCompleto: true } },
    },
  });
  if (!p) notFound();
  const revision = p.revision as RevisionPlantilla | null;
  const parrafos = vistaPreviaDocx(Buffer.from(p.archivo));
  const admin = s.usuario.rol === 'ADMINISTRADOR';
  const esquema = ESQUEMAS[p.tipoId];
  const revisando = enRevision(revision);

  // Corrección con IA de los hallazgos: elegir → la IA propone (en segundo plano) → aplicar en una versión nueva
  const hallazgos = hallazgosOrdenados(revision);
  const corregible = !!process.env.ANTHROPIC_API_KEY && p.estado !== 'RETIRADA' && hallazgos.length > 0;
  const correccion = corregible ? await estadoCorreccionPlantilla(p.id) : null;
  const propuesta = correccion?.estado === 'COMPLETADA' && (correccion.propuestas.some((x) => x.estado === 'PENDIENTE') || correccion.sinCorreccion.length > 0) ? correccion : null;
  const enCurso = correccion?.estado === 'EN_CURSO';
  const mensajeHallazgo = (i: number) => revision?.ia?.hallazgos[i]?.mensaje ?? 'Hallazgo';
  const nuevaVersion = correccion?.nuevaVersionId ? p.tipo.plantillas.find((v) => v.id === correccion.nuevaVersionId) : undefined;

  // Variantes: varias plantillas aprobadas del mismo tipo (por banco, obra…); cada una con sus versiones
  const conVariantes = p.tipo.variantes;
  const variante = nombreVariante(p);
  const clave = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  const versiones = conVariantes ? p.tipo.plantillas.filter((v) => clave(nombreVariante(v)) === clave(variante)) : p.tipo.plantillas;
  const variantes = conVariantes
    ? [...new Map(p.tipo.plantillas.map((v) => [clave(nombreVariante(v)), v])).values()].map((ultima) => {
      const suyas = p.tipo.plantillas.filter((v) => clave(nombreVariante(v)) === clave(nombreVariante(ultima)));
      const vigente = suyas.find((v) => v.estado === 'APROBADA');
      const pendiente = suyas.find((v) => v.estado === 'PENDIENTE_APROBACION');
      return { nombre: nombreVariante(ultima), principal: pendiente ?? vigente ?? suyas[0], vigente, pendiente, criterios: (vigente ?? suyas[0]).criterios };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre))
    : [];
  const pendientesVariantes = variantes.filter((v) => v.pendiente).length;

  return (
    <>
      <p><Link href="/plantillas">← Plantillas</Link></p>
      <div className="fila entre">
        <h1 style={{ marginBottom: 0 }}>{p.tipo.nombre}</h1>
        <span className={`etiqueta ${ESTADO_PLANTILLA[p.estado][0]}`}>v{p.version} {ESTADO_PLANTILLA[p.estado][1]}</span>
      </div>
      {conVariantes && <p style={{ marginBottom: 0 }}>Variante <strong>«{variante}»</strong>{p.criterios ? <span className="suave"> · se usa cuando: {p.criterios}</span> : <span className="suave"> · sin criterios escritos (la IA se guía por la carátula del modelo)</span>}</p>}
      <p className="suave">{p.tipo.esBloque ? 'Bloque común de las escrituras con formulario propio' : p.tipo.categoria}{p.tipo.descripcion ? ` · ${p.tipo.descripcion}` : ''}</p>
      <p className="suave">Modelo de redacción: la IA lo toma como base (estructura, cláusulas y forma de redactar) y escribe cada escritura con los datos del caso. Los datos que trae este modelo no se copian.</p>

      {conVariantes && (
        <details className="tarjeta" open={variantes.length <= 12}>
          <summary><strong>Variantes de «{p.tipo.nombre}»</strong> <span className="suave">({variantes.length} · {variantes.filter((v) => v.vigente).length} aprobadas{pendientesVariantes ? ` · ${pendientesVariantes} pendientes` : ''})</span></summary>
          <p className="suave">La estructura de esta escritura cambia según el banco, la obra o la constructora. Al generar cada escritura, la IA lee los documentos y elige la variante aprobada que corresponde (el funcionario también puede indicarla). Cada variante tiene sus propias versiones.</p>
          <TablaVariantes actualId={p.id} variantes={variantes.map((v) => ({
            nombre: v.nombre, principalId: v.principal.id, vigente: v.vigente?.version, pendiente: v.pendiente?.version, criterios: v.criterios,
          }))} />
          {admin && pendientesVariantes > 0 && (
            <FormAdmin accion={accionAprobarVariantes} ocultos={{ tipoId: p.tipoId }}
              campos={[{ nombre: 'confirmacion', etiqueta: `Para aprobar las ${pendientesVariantes} variantes pendientes escriba: APROBADA POR EL NOTARIO`, ayuda: 'Apruebe en bloque solo si el notario revisó todas. Si una variante tiene una versión aprobada, esta queda retirada y la reemplaza la pendiente.' }]}
              botones={[{ texto: `Aprobar las ${pendientesVariantes} pendientes`, clase: 'exito' }]} />
          )}
        </details>
      )}

      {versiones.length > 1 && (
        <nav className="pestanas" aria-label="Versiones">
          {versiones.map((v) => (
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
            <a className="boton pequeno" href={`/api/plantillas/${p.id}`}>Descargar plantilla (.docx)</a>
            <span className="suave">Ábrala en Word para confirmar márgenes, fuentes y saltos de página exactos.</span>
          </div>

          {vista === 'diseno' && (
            <VisorDocx url={`/api/plantillas/${p.id}?vista=1`} />
          )}

          {vista === 'texto' && (
            <>
              <VistaDocumento parrafos={parrafos} />
              <p className="suave">Solo el texto del cuerpo, que es lo que la IA lee como modelo. El diseño completo está en la pestaña «Diseño».</p>
            </>
          )}

        </div>

        <aside>
          <section className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Revisión</h2>
            {corregida && <div className="aviso info">Esta versión se creó con las correcciones de la IA (ver notas abajo). Revísela con la IA y en Word antes de aprobarla.</div>}
            <PanelRevision revision={revision} revisadaEn={fecha(p.revisadaEn)} ocultarHallazgos={corregible && !propuesta && !enCurso} />
            {revisando ? (
              <>
                <RefrescoAutomatico segundos={8} />
                <div className="aviso info" role="status"><span className="girador pequeno" aria-hidden="true" /> La IA está revisando esta versión; tarda uno o dos minutos. Puede salir de esta página: en el listado de plantillas verá «Analizando con IA…» hasta que termine.</div>
              </>
            ) : (
              <FormAdmin accion={accionRevisarPlantilla} ocultos={{ id: p.id }} botones={[{ texto: revision ? 'Revisar de nuevo con IA' : 'Revisar con IA', clase: 'secundario' }]}
                mensajePendiente="Iniciando la revisión…" />
            )}
          </section>

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

          {conVariantes && (
            <section className="tarjeta">
              <h2 style={{ marginTop: 0 }}>Variante</h2>
              <p className="suave">El nombre identifica la variante (todas sus versiones lo comparten). Los criterios le dicen a la IA cuándo usarla: banco o entidad, obra o constructora, actos que van juntos, subsidio. No cambian el texto del modelo.</p>
              <FormAdmin accion={accionVariante} ocultos={{ id: p.id }} campos={[
                { nombre: 'variante', etiqueta: 'Nombre de la variante', valor: variante },
                { nombre: 'criterios', etiqueta: 'Cuándo usarla', tipo: 'area', valor: p.criterios ?? '', ayuda: 'P. ej.: «Hipoteca a favor de BANCOLOMBIA; vende CONSTRUESPACIOS S.A.S. (fideicomiso Valle de Génova, Acción Fiduciaria); compraventa con constitución de patrimonio de familia; subsidio de Comfamiliar».' },
              ]} botones={[{ texto: 'Guardar', clase: 'secundario' }]} />
            </section>
          )}

          <section className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Cargar nueva versión{conVariantes ? ' de esta variante' : ''}</h2>
            <p className="suave">Será la v{Math.max(...p.tipo.plantillas.map((v) => v.version)) + 1}{conVariantes ? ` y reemplazará a la variante «${variante}» al aprobarse` : ' de esta plantilla'}; quedará pendiente de aprobación. Cargue la escritura modelo tal como está en Word; después puede pedir la revisión de la IA.</p>
            <FormAdmin accion={accionCargarPlantilla} ocultos={{ tipoId: p.tipoId, ...(conVariantes ? { variante } : {}) }} campos={[
              { nombre: 'archivo', etiqueta: 'Escritura modelo (.docx)', tipo: 'archivo' },
              { nombre: 'notas', etiqueta: 'Notas de la versión', tipo: 'area', ayuda: 'Qué cambió y por qué (la IA también lo lee).' },
            ]} botones={[{ texto: 'Cargar versión' }]}
            mensajePendiente="Cargando la versión…" />
          </section>

          {conVariantes && (
            <section className="tarjeta">
              <h2 style={{ marginTop: 0 }}>Agregar otra variante</h2>
              <p className="suave">Para un banco, una obra o una combinación de actos que aún no tiene modelo. Queda pendiente de aprobación; las variantes aprobadas siguen vigentes.</p>
              <FormAdmin accion={accionCargarPlantilla} ocultos={{ tipoId: p.tipoId, nuevaVariante: '1' }} campos={[
                { nombre: 'archivo', etiqueta: 'Escritura modelo (.docx)', tipo: 'archivo' },
                { nombre: 'variante', etiqueta: 'Nombre de la variante (opcional)', ayuda: 'P. ej. «Davivienda · RDG Construcciones Villa Santa». Si lo deja vacío, la IA lo escribe al cargar.' },
                { nombre: 'criterios', etiqueta: 'Cuándo usarla (opcional)', tipo: 'area', ayuda: 'Banco o entidad, obra o constructora, actos que van juntos, subsidio. Si lo deja vacío, la IA lo escribe al cargar, comparando el modelo con las demás variantes.' },
                { nombre: 'notas', etiqueta: 'Notas', tipo: 'area' },
              ]} botones={[{ texto: 'Agregar variante' }]}
              mensajePendiente="Cargando la variante (si no escribió nombre o cuándo usarla, la IA los está escribiendo)…" />
            </section>
          )}

          {p.estado !== 'RETIRADA' && (
            <section className="tarjeta">
              <h2 style={{ marginTop: 0 }}>Aprobación</h2>
              {!admin ? (
                <p className="suave">{p.estado === 'APROBADA' ? (conVariantes ? 'Es la versión vigente de esta variante.' : 'Es la versión vigente.') : 'La aprueba el administrador por indicación del notario, después de revisar el texto y los hallazgos.'}</p>
              ) : p.estado === 'PENDIENTE_APROBACION' ? (
                <>
                  {revision?.ia?.veredicto === 'NO_APTA' && <div className="aviso error">La IA la marcó como <strong>no apta</strong>. Revise los hallazgos con el notario antes de aprobar.</div>}
                  {!revision && <div className="aviso alerta">Esta versión aún no ha sido revisada.</div>}
                  <FormAdmin accion={accionPlantilla} ocultos={{ id: p.id }} campos={[{ nombre: 'confirmacion', etiqueta: 'Para aprobar escriba: APROBADA POR EL NOTARIO', ayuda: 'Apruebe solo después de que el notario haya revisado el texto de la plantilla.' }]}
                    botones={[{ operacion: 'aprobar', texto: 'Aprobar', clase: 'exito' }, { operacion: 'retirar', texto: 'Retirar', clase: 'secundario' }]} />
                </>
              ) : (
                <FormAdmin accion={accionPlantilla} ocultos={{ id: p.id }} botones={[{ operacion: 'retirar', texto: 'Retirar', clase: 'peligro' }]}
                  confirmar={{ retirar: conVariantes && variantes.filter((v) => v.vigente).length > 1 ? `La IA dejará de elegir la variante «${variante}»; las demás siguen vigentes. ¿Retirar?` : 'Sin una versión aprobada no se podrán redactar escrituras de este tipo. ¿Retirar?' }} />
              )}
            </section>
          )}

          {admin && !p.tipo.esBloque && (
            <section className="tarjeta">
              <h2 style={{ marginTop: 0 }}>Varias plantillas</h2>
              {conVariantes ? (
                <>
                  <p className="suave">Este tipo admite varias plantillas aprobadas a la vez (variantes) y la IA elige la que corresponde a cada caso.</p>
                  <FormAdmin accion={accionCambiarVariantes} ocultos={{ tipoId: p.tipoId }} botones={[{ operacion: 'desactivar', texto: 'Usar una sola plantilla', clase: 'secundario' }]}
                    confirmar={{ desactivar: 'Debe quedar una sola versión aprobada. ¿Continuar?' }} />
                </>
              ) : (
                <>
                  <p className="suave">Active esta opción si la estructura de este tipo de escritura cambia según el banco, la obra u otra circunstancia: podrá tener varias plantillas aprobadas y la IA elegirá la que corresponde a cada caso.</p>
                  <FormAdmin accion={accionCambiarVariantes} ocultos={{ tipoId: p.tipoId }} botones={[{ operacion: 'activar', texto: 'Admitir varias plantillas', clase: 'secundario' }]} />
                </>
              )}
            </section>
          )}

          <section className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Eliminar</h2>
            <p className="suave">Se borra de forma definitiva (queda constancia en la auditoría). El tipo de escritura «{p.tipo.nombre}» se conserva para cargarle otra plantilla. Las versiones con las que ya se generaron borradores no se pueden eliminar.</p>
            <FormAdmin accion={accionEliminarPlantilla} ocultos={{ id: p.id, tipoId: p.tipoId }}
              botones={[
                { operacion: 'version', texto: `Eliminar la versión ${p.version}`, clase: 'peligro' },
                ...(p.tipo.plantillas.length > 1 ? [{ operacion: 'completa', texto: `Eliminar la plantilla completa (${p.tipo.plantillas.length} versiones)`, clase: 'peligro' }] : []),
              ]}
              confirmar={{
                version: `¿Eliminar definitivamente la versión ${p.version}${p.estado === 'APROBADA' ? ', que es la VIGENTE? Sin una versión aprobada no se podrán generar borradores de este tipo' : ''}?`,
                completa: `¿Eliminar definitivamente las ${p.tipo.plantillas.length} versiones de la plantilla de «${p.tipo.nombre}»? No se podrán generar borradores de este tipo hasta cargar y aprobar otra.`,
              }} />
          </section>
        </aside>
      </div>
    </>
  );
}
