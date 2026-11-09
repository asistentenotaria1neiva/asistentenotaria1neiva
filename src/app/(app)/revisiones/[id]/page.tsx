import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { requerirSesion } from '@/lib/sesion';
import { obtenerRevision, resultadoDe, avanceDe, revisionPorReanudar, ErrorRevisionEscritura } from '@/lib/servicios/revision-escrituras';
import { BotonAccion, RefrescoAutomatico } from '../../expedientes/formularios';
import { EtiquetaNivel, fecha } from '../../componentes';
import { VisorDocx } from '../../plantillas/VisorDocx';
import { accionAplicarCambios, accionEliminarRevision, accionReanalizar } from '../acciones';
import { SeleccionCambios } from './SeleccionCambios';

// Una etapa que dejó de avanzar se reanuda desde esta página
export const maxDuration = 300;

const CATEGORIA: Record<string, string> = { DATOS: 'Datos', CUENTAS: 'Cuentas', CONTENIDO: 'Contenido', REDACCION: 'Redacción', NORMATIVA: 'Normativa', FORMATO: 'Formato' };
const paginas = (t: { desde: number; hasta: number }) => (t.desde === t.hasta ? `pág. ${t.desde}` : `págs. ${t.desde}-${t.hasta}`);

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
  const reanudar = await revisionPorReanudar(id);
  if (reanudar) after(reanudar);
  const res = resultadoDe(r);
  const avance = avanceDe(r);
  const enCurso = r.estado === 'EN_CURSO';
  const verCorregida = !!r.rutaCorregida && ver !== 'transcrita';

  const aplicables = res?.cambios.filter((c) => c.aplicable) ?? [];
  const manuales = res?.cambios.filter((c) => !c.aplicable) ?? [];
  const pdf = `/api/revisiones/${r.id}`;

  return (
    <>
      {enCurso && <RefrescoAutomatico segundos={10} />}
      <p><Link href="/revisiones">← Revisar escritura</Link></p>
      <h1 style={{ marginBottom: 0, overflowWrap: 'anywhere' }}>{r.nombreArchivo}</h1>
      <p className="suave">
        Cargada {fecha(r.creadaEn)} por {r.cargadaPor.nombreCompleto}{r.paginas ? ` · ${r.paginas} páginas` : ''}
        {res?.tipoEscritura ? ` · ${res.tipoEscritura}` : ''}
      </p>

      <div className="detalle-plantilla">
        <div>
          {enCurso && (
            <div className="aviso info" role="status">
              <span className="girador pequeno" aria-hidden="true" /> {avance?.texto ?? 'Revisando'}… {avance ? `(${avance.porcentaje} %)` : ''}
              <div className="suave">Suele tardar entre 5 y 15 minutos según el número de páginas. Puede salir de esta página: le llegará un aviso al terminar.</div>
            </div>
          )}
          {r.estado === 'ERROR' && <div className="aviso error">La revisión no se completó: {r.error}</div>}
          {res?.avisos.map((a, i) => <div key={i} className="aviso alerta">{a}</div>)}

          {res && !enCurso && (
            <>
              <section className="tarjeta">
                <h2 style={{ marginTop: 0 }}>Cambios recomendados ({aplicables.length})</h2>
                {aplicables.length ? (
                  <>
                    <p className="suave">Revise cada cambio antes de aplicarlo: la IA puede equivocarse. Solo cambian los fragmentos marcados; la estructura de la escritura (cláusulas, orden y numeración) se conserva.</p>
                    <SeleccionCambios key={r.aplicadaEn?.toISOString() ?? 'sin-aplicar'} aplicar={accionAplicarCambios.bind(null, r.id)} hayCorregida={!!r.rutaCorregida}
                      cambios={aplicables.map((c) => ({ numero: c.numero, nivel: c.nivel, categoria: CATEGORIA[c.categoria] ?? c.categoria, ubicacion: c.ubicacion, original: c.original, corregido: c.corregido, motivo: c.motivo, fuente: c.fuente, veces: c.veces, aplicado: c.aplicado }))} />
                  </>
                ) : <p className="suave">La IA no recomendó cambios de texto que se puedan aplicar automáticamente.</p>}
                {!!res.fallidas?.length && (
                  <div className="aviso alerta" style={{ marginTop: '0.75rem' }}>
                    No se pudieron aplicar (corríjalos a mano):
                    <ul style={{ margin: '0.25rem 0 0' }}>{res.fallidas.map((f, i) => <li key={i}>{f}</li>)}</ul>
                  </div>
                )}
              </section>

              {(manuales.length > 0 || res.observaciones.length > 0) && (
                <section className="tarjeta">
                  <h2 style={{ marginTop: 0 }}>Para revisar a mano ({manuales.length + res.observaciones.length})</h2>
                  <p className="suave">Sin un cambio automático seguro: una parte que falta, un dato que no se puede confirmar con los soportes o un cambio que no se pudo ubicar en el texto. También quedan al final de la escritura generada.</p>
                  <ul className="hallazgos">
                    {res.observaciones.map((o, i) => (
                      <li key={`o${i}`}>
                        <div className="fila"><EtiquetaNivel nivel={o.nivel} /><span className="suave">{CATEGORIA[o.categoria] ?? o.categoria} · {o.ubicacion}</span></div>
                        <div>{o.mensaje}</div>
                        {o.fuente && <div className="suave">Fuente: {o.fuente}</div>}
                      </li>
                    ))}
                    {manuales.map((c) => (
                      <li key={`c${c.numero}`}>
                        <div className="fila"><EtiquetaNivel nivel={c.nivel} /><span className="suave">{CATEGORIA[c.categoria] ?? c.categoria} · {c.ubicacion}</span></div>
                        <div>{c.motivo}</div>
                        <div className="cambio revision-marcas" style={{ marginTop: 4 }}><del>{c.original}</del> → <ins>{c.corregido || '(se elimina)'}</ins></div>
                        <div className="suave">{c.noAplicable}{c.fuente ? ` Fuente: ${c.fuente}.` : ''}</div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {r.rutaBase && (
            <section className="tarjeta">
              <h2 style={{ marginTop: 0 }}>Escritura</h2>
              {r.rutaCorregida && (
                <nav className="pestanas" aria-label="Versión">
                  <Link href={`/revisiones/${r.id}`} aria-current={verCorregida ? 'page' : undefined}>Con los cambios marcados</Link>
                  <Link href={`/revisiones/${r.id}?ver=transcrita`} aria-current={!verCorregida ? 'page' : undefined}>Transcrita, sin cambios</Link>
                </nav>
              )}
              {verCorregida
                ? <p className="suave"><span className="marca-agregado">Agregado</span> · <span className="marca-eliminado">Eliminado</span> · el número rojo remite a la relación de cambios, al final.</p>
                : <p className="suave">La escritura del PDF transcrita por la IA, con el formato de la notaría. Compárela con el PDF si algo no coincide.</p>}
              <VisorDocx key={`${verCorregida}-${r.aplicadaEn?.getTime() ?? 0}`} url={`/api/revisiones/${r.id}?vista=1&archivo=${verCorregida ? 'corregida' : 'transcrita'}`} />
            </section>
          )}
        </div>

        <aside>
          <section className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Resultado</h2>
            {res ? (
              <>
                <p>{res.resumen}</p>
                <p className="suave">
                  {res.cambios.length} cambio(s) recomendado(s): {aplicables.length} aplicable(s) automáticamente, {manuales.length + res.observaciones.length} para revisar a mano.
                  <br />Comparada con la plantilla aprobada de «{res.plantilla.tipo}» (v{res.plantilla.version}).
                  {r.analizadaEn && <><br />Revisada {fecha(r.analizadaEn)}{r.modelo ? ` · ${r.modelo}` : ''}</>}
                </p>
              </>
            ) : <p className="suave">{enCurso ? 'Revisando…' : 'Sin resultado.'}</p>}
            {!enCurso && <BotonAccion accion={accionReanalizar.bind(null, r.id)} texto="Revisar de nuevo con IA" textoPendiente="Iniciando…" clase="secundario pequeno"
              confirmar="La IA transcribirá y revisará la escritura otra vez desde el PDF; la escritura corregida actual se descarta. ¿Continuar?" />}
          </section>

          <section className="tarjeta">
            <h2 style={{ marginTop: 0 }}>Descargar</h2>
            <div className="fila" style={{ gap: '0.5rem' }}>
              {r.rutaCorregida && <a className="boton pequeno" href={`/api/revisiones/${r.id}?archivo=corregida`}>Con los cambios marcados (.docx)</a>}
              {r.rutaCorregida && <a className="boton pequeno secundario" href={`/api/revisiones/${r.id}?archivo=limpia`}>Corregida sin marcas (.docx)</a>}
              {r.rutaBase && <a className="boton pequeno secundario" href={`/api/revisiones/${r.id}?archivo=transcrita`}>Transcrita sin cambios (.docx)</a>}
              <a className="boton pequeno secundario" href={pdf} target="_blank" rel="noopener">PDF cargado</a>
            </div>
            {r.rutaCorregida && <p className="suave" style={{ marginBottom: 0 }}>Generada {fecha(r.aplicadaEn)}. La versión con marcas lleva al final la relación de cambios (qué, dónde, por qué y con qué soporte); la versión sin marcas tiene los mismos cambios, lista para usar. Revísela en Word antes de firmar.</p>}
          </section>

          {res && (
            <section className="tarjeta">
              <h2 style={{ marginTop: 0 }}>Contenido del PDF</h2>
              <p className="suave">Escritura: {res.escritura.map(paginas).join(', ')}.</p>
              {res.soportes.length ? (
                <ul className="hallazgos">
                  {res.soportes.map((x, i) => (
                    <li key={i}><strong>{x.tipo}</strong> <a href={`${pdf}#page=${x.desde}`} target="_blank" rel="noopener" className="suave">{paginas(x)}</a><div className="suave">{x.descripcion}</div></li>
                  ))}
                </ul>
              ) : <p className="suave">No se encontraron documentos soporte.</p>}
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
              <p className="suave">Se borran el PDF cargado y las escrituras generadas (queda constancia en la auditoría).</p>
              <BotonAccion accion={accionEliminarRevision.bind(null, r.id)} texto="Eliminar revisión" clase="peligro pequeno" confirmar="¿Eliminar definitivamente esta revisión y sus archivos?" />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
