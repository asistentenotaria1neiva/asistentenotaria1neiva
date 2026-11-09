import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { obtenerRevision, resultadoDe, ErrorRevisionEscritura } from '@/lib/servicios/revision-escrituras';
import { BotonAccion, RefrescoAutomatico } from '../../expedientes/formularios';
import { EtiquetaNivel, fecha } from '../../componentes';
import { VisorDocx } from '../../plantillas/VisorDocx';
import { accionAplicarCambios, accionEliminarRevision, accionReanalizar } from '../acciones';
import { SeleccionCambios } from './SeleccionCambios';

// Volver a analizar programa la IA, que puede tardar unos minutos
export const maxDuration = 300;

const CATEGORIA: Record<string, string> = { DATOS: 'Datos', REDACCION: 'Redacción', CONTENIDO: 'Contenido', NORMATIVA: 'Normativa', FORMATO: 'Formato' };

export default async function DetalleRevision({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ver?: string }> }) {
  const s = await requerirSesion();
  const { id } = await params;
  const { ver } = await searchParams;
  let r: Awaited<ReturnType<typeof obtenerRevision>>;
  try {
    r = await obtenerRevision(s, id);
  } catch (e) {
    if (e instanceof ErrorRevisionEscritura) notFound();
    throw e;
  }
  const res = resultadoDe(r);
  const enCurso = r.estado === 'EN_CURSO';
  const tipo = r.tipoId ? await db.tipoEscritura.findUnique({ where: { id: r.tipoId }, select: { nombre: true } }) : null;
  const verCorregida = !!r.rutaCorregida && ver !== 'original';

  const recomendaciones = res?.recomendaciones.map((x, indice) => ({ ...x, indice })) ?? [];
  const aplicables = recomendaciones.filter((x) => x.aplicable);
  const manuales = recomendaciones.filter((x) => !x.aplicable);
  const formatoMal = res?.formato.filter((f) => !f.ok) ?? [];

  return (
    <>
      {enCurso && <RefrescoAutomatico segundos={8} />}
      <p><Link href="/revisiones">← Revisar escritura</Link></p>
      <h1 style={{ marginBottom: 0, overflowWrap: 'anywhere' }}>{r.nombreArchivo}</h1>
      <p className="suave">
        Cargada {fecha(r.creadaEn)} por {r.cargadaPor.nombreCompleto}
        {tipo ? ` · tipo indicado: ${tipo.nombre}` : ''}
        {res?.tipoDetectado ? ` · la IA la identifica como: ${res.tipoDetectado}` : ''}
      </p>

      <div className="detalle-plantilla">
        <div>
          {enCurso && (
            <div className="aviso info" role="status"><span className="girador pequeno" aria-hidden="true" /> La IA está revisando la escritura; suele tardar entre uno y tres minutos. Puede salir de esta página: el resultado queda guardado en «Revisar escritura».</div>
          )}
          {r.estado === 'ERROR' && <div className="aviso error">El análisis no se completó: {r.error}</div>}

          {res && !enCurso && (
            <>
              <section className="tarjeta">
                <h2 style={{ marginTop: 0 }}>Cambios recomendados</h2>
                {aplicables.length ? (
                  <>
                    <p className="suave">Revise cada cambio antes de aplicarlo: la IA puede equivocarse. Solo cambian los fragmentos de texto marcados; la estructura de la escritura (cláusulas, orden y formato) se conserva.</p>
                    <SeleccionCambios key={r.aplicadaEn?.toISOString() ?? 'sin-aplicar'} aplicar={accionAplicarCambios.bind(null, r.id)} hayCorregida={!!r.rutaCorregida}
                      cambios={aplicables.map((x) => ({ indice: x.indice, nivel: x.nivel, categoria: CATEGORIA[x.categoria] ?? x.categoria, mensaje: x.mensaje, original: x.original!, corregido: x.corregido!, veces: x.veces, aplicada: x.aplicada }))} />
                  </>
                ) : <p className="suave">La IA no recomendó cambios de texto que se puedan aplicar automáticamente.</p>}
                {!!res.fallidas?.length && (
                  <div className="aviso alerta" style={{ marginTop: '0.75rem' }}>
                    No se pudieron aplicar (corríjalos en Word):
                    <ul style={{ margin: '0.25rem 0 0' }}>{res.fallidas.map((f, i) => <li key={i}>{f}</li>)}</ul>
                  </div>
                )}
              </section>

              {manuales.length > 0 && (
                <section className="tarjeta">
                  <h2 style={{ marginTop: 0 }}>Para revisar a mano ({manuales.length})</h2>
                  <p className="suave">Observaciones sin un cambio automático seguro (p. ej. una cláusula que falta o un dato que hay que confirmar con los documentos). Corríjalas en Word si corresponde.</p>
                  <ul className="hallazgos">
                    {manuales.map((x) => (
                      <li key={x.indice}>
                        <div className="fila"><EtiquetaNivel nivel={x.nivel} /><span className="suave">{CATEGORIA[x.categoria] ?? x.categoria}</span></div>
                        <div>{x.mensaje}</div>
                        {x.original && <div className="cambio" style={{ marginTop: 4 }}><del>{x.original}</del>{x.corregido !== null && <> → <ins>{x.corregido || '(se elimina)'}</ins></>}</div>}
                        {x.motivo && <div className="suave">{x.motivo}</div>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          <section className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Documento</h2>
            {r.rutaCorregida && (
              <nav className="pestanas" aria-label="Versión">
                <Link href={`/revisiones/${r.id}`} aria-current={verCorregida ? 'page' : undefined}>Corregida</Link>
                <Link href={`/revisiones/${r.id}?ver=original`} aria-current={!verCorregida ? 'page' : undefined}>Original</Link>
              </nav>
            )}
            <VisorDocx key={`${verCorregida}-${r.aplicadaEn?.getTime() ?? 0}`} url={`/api/revisiones/${r.id}?vista=1${verCorregida ? '&archivo=corregida' : ''}`} />
          </section>
        </div>

        <aside>
          <section className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Resultado</h2>
            {res ? (
              <>
                <p>{res.resumen}</p>
                <p className="suave">
                  {recomendaciones.length} recomendación(es): {aplicables.length} aplicable(s) automáticamente, {manuales.length} para revisar a mano.
                  {res.comparadaCon && <><br />Comparada con el modelo aprobado de «{res.comparadaCon.tipo}» (v{res.comparadaCon.version}).</>}
                  {r.analizadaEn && <><br />Analizada {fecha(r.analizadaEn)}{r.modelo ? ` · ${r.modelo}` : ''}</>}
                </p>
                {res.recortada && <div className="aviso alerta">La escritura es muy larga: la IA revisó solo su comienzo.</div>}
              </>
            ) : <p className="suave">{enCurso ? 'Analizando…' : 'Sin resultado.'}</p>}
            {!enCurso && <BotonAccion accion={accionReanalizar.bind(null, r.id)} texto="Analizar de nuevo con IA" textoPendiente="Iniciando…" clase="secundario pequeno"
              confirmar={r.rutaCorregida ? 'Se descartará la versión corregida y la IA hará recomendaciones nuevas sobre el original. ¿Continuar?' : undefined} />}
          </section>

          <section className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Descargar</h2>
            <div className="fila" style={{ gap: '0.5rem' }}>
              {r.rutaCorregida && <a className="boton pequeno" href={`/api/revisiones/${r.id}?archivo=corregida`}>Escritura corregida (.docx)</a>}
              <a className={`boton pequeno${r.rutaCorregida ? ' secundario' : ''}`} href={`/api/revisiones/${r.id}`}>Original (.docx)</a>
            </div>
            {r.rutaCorregida && <p className="suave" style={{ marginBottom: 0 }}>Corregida {fecha(r.aplicadaEn)}. Ábrala en Word y revísela antes de usarla.</p>}
          </section>

          {res && (
            <section className="tarjeta">
              <h2 style={{ marginTop: 0 }}>Formato de la notaría</h2>
              <p className="suave">Verificación automática (no se cambia nada). Corrija en Word lo que esté marcado.</p>
              <ul className="hallazgos">
                {res.formato.map((f, i) => (
                  <li key={i}><span className={`etiqueta ${f.ok ? 'ok' : 'advertencia'}`}>{f.ok ? 'Bien' : 'Revisar'}</span> {f.mensaje}</li>
                ))}
              </ul>
              {!formatoMal.length && <p className="suave" style={{ marginBottom: 0 }}>El formato coincide con el de la notaría.</p>}
            </section>
          )}

          {r.notas && (
            <section className="tarjeta">
              <h2 style={{ marginTop: 0 }}>Lo que pidió revisar</h2>
              <p style={{ marginBottom: 0 }}>{r.notas}</p>
            </section>
          )}

          {!enCurso && (
            <section className="tarjeta">
              <h2 style={{ marginTop: 0 }}>Eliminar</h2>
              <p className="suave">Se borran la escritura cargada y su versión corregida (queda constancia en la auditoría).</p>
              <BotonAccion accion={accionEliminarRevision.bind(null, r.id)} texto="Eliminar revisión" clase="peligro pequeno" confirmar="¿Eliminar definitivamente esta revisión y sus archivos?" />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
