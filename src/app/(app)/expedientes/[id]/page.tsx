import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { expedienteDePagina, puedeEditar, ErrorNegocio } from '@/lib/servicios/expedientes';
import { generacionEnCurso, generacionPorReanudar, cambiosDeVersion, type ResultadoGeneracion } from '@/lib/servicios/generacion';
import { leerDocumento, LECTURA_CORTADA_MS } from '@/lib/servicios/documentos';
import { lecturaComoTexto, type Lectura } from '@/lib/ia/instrucciones';
import { EtiquetaVersion, Tabla, fecha, hace } from '../../componentes';
import { Icono, type NombreIcono } from '../../../Icono';
import { VistaPlegable } from '../../plantillas/VistaPlegable';
import { BotonAccion, FormularioCarga, RefrescoAutomatico } from '../formularios';
import { FormularioObservaciones } from './Observaciones';
import { CorregirVersion } from './CorregirVersion';
import {
  accionCompletarDocumento, accionEliminarDocumento, accionReleerDocumento, accionGuardarObservaciones, accionGenerar, accionEliminarExpediente, accionRestaurarExpediente, accionCancelarGeneracion, accionCorregirVersion,
} from '../acciones';

// Las acciones de esta página (cargar, generar) siguen trabajando en segundo plano después de responder
export const maxDuration = 300;

const ESTADO_LECTURA: Record<string, { texto: string; clase: string; li: string }> = {
  PENDIENTE: { texto: 'Por leer', clase: '', li: '' },
  EN_CURSO: { texto: 'Leyendo…', clase: 'informativa gira', li: '' },
  LEIDO: { texto: 'Leído', clase: 'ok', li: 'leido' },
  ERROR: { texto: 'No se pudo leer', clase: 'critica', li: 'error' },
};

const NIVELES = [
  { nivel: 'CRITICA', titulo: 'Críticas', clase: 'critica', icono: 'error' },
  { nivel: 'ADVERTENCIA', titulo: 'Advertencias', clase: 'advertencia', icono: 'alerta' },
  { nivel: 'INFORMATIVA', titulo: 'Informativas', clase: 'informativa', icono: 'info' },
] as const;

/** Etapas de la generación: salen del porcentaje que calcula el servidor (≤30 lectura, 40–80 redacción, 85 faltantes, 95 Word) */
const ETAPAS = ['Lectura de los documentos', 'Redacción sobre la plantilla', 'Búsqueda de los datos faltantes', 'Armado del Word'];
const etapaDe = (porcentaje: number) => (porcentaje <= 30 ? 0 : porcentaje < 85 ? 1 : porcentaje < 95 ? 2 : 3);

const tamano = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const iconoArchivo = (nombre: string): NombreIcono => (/\.(jpe?g|png|webp)$/i.test(nombre) ? 'imagen' : 'documento');
/** Versión que corrige una versión hecha con «Corregir esta versión» */
const correccionDe = (g: { progreso: unknown }) => (g.progreso as { ajuste?: { version?: number } } | null)?.ajuste?.version;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default async function Escritura({ params }: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  const { id } = await params;
  let e: Awaited<ReturnType<typeof expedienteDePagina>>;
  try { e = await expedienteDePagina(s, id); } catch (err) { if (err instanceof ErrorNegocio) notFound(); throw err; }
  const editable = puedeEditar(s, e);
  const esAdmin = s.usuario.rol === 'ADMINISTRADOR';

  // Una etapa de la generación que se cortó se reanuda; un documento cuya lectura no empezó o se cortó, se lee
  const reanudar = await generacionPorReanudar(id);
  if (reanudar) after(() => reanudar().catch((err) => console.error('[reanudar generación]', err)));
  const [documentos, enCurso, generaciones] = await Promise.all([
    db.documento.findMany({ where: { expedienteId: id }, orderBy: { creadoEn: 'asc' } }),
    generacionEnCurso(id),
    db.generacion.findMany({ where: { expedienteId: id }, orderBy: { version: 'desc' }, take: 20, include: { generadaPor: { select: { nombreCompleto: true } } } }),
  ]);
  const trabados = documentos.filter((d) => (d.estadoLectura === 'PENDIENTE' && Date.now() - d.creadoEn.getTime() > 60_000) || (d.estadoLectura === 'EN_CURSO' && Date.now() - d.actualizadoEn.getTime() > LECTURA_CORTADA_MS));
  if (editable && !enCurso && trabados.length && process.env.ANTHROPIC_API_KEY) {
    after(async () => { for (const d of trabados.slice(0, 3)) await leerDocumento(d.id, s.usuario.id).catch((err) => console.error('[leerDocumento]', err)); });
  }
  const leyendo = documentos.some((d) => d.estadoLectura === 'EN_CURSO' || d.estadoLectura === 'PENDIENTE');
  // Una generación cancelada no reemplaza a la versión anterior: se sigue mostrando la última terminada
  const ultima = generaciones.find((g) => g.estado !== 'EN_CURSO' && g.estado !== 'CANCELADA');
  const cancelada = !enCurso && generaciones[0]?.estado === 'CANCELADA' ? generaciones[0] : null;
  const resultado = ultima?.estado === 'COMPLETADA' ? (ultima.resultado as unknown as ResultadoGeneracion) : null;
  const version = generaciones[0]?.version ?? 0;
  const advertencias = resultado?.advertencias ?? [];
  const criticas = advertencias.filter((a) => a.nivel === 'CRITICA').length;
  const conteoNivel = (nivel: string) => advertencias.filter((a) => a.nivel === nivel).length;

  // ---- Estado del flujo: se deduce de lo que ya se consultó ----
  const conPlantilla = !!(e.plantillaId || e.plantillaRuta);
  const leidos = documentos.filter((d) => d.estadoLectura === 'LEIDO').length;
  const conError = documentos.filter((d) => d.estadoLectura === 'ERROR').length;
  const enLectura = documentos.length - leidos - conError;
  const conObservaciones = !!e.observaciones?.trim();
  const pasoActual = !conPlantilla ? 1 : enCurso ? 4 : resultado ? 5 : !documentos.length ? 2 : 3;
  const estadoPaso = [
    conPlantilla ? 'hecho' : 'actual atencion',
    documentos.length && !enLectura ? 'hecho' : pasoActual === 2 ? 'actual' : '',
    conObservaciones || generaciones.length ? 'hecho' : pasoActual === 3 ? 'actual' : '',
    enCurso ? 'actual en-curso' : resultado ? 'hecho' : ultima?.estado === 'ERROR' ? 'actual atencion' : '',
    resultado ? (criticas ? 'actual atencion' : 'actual') : '',
  ];
  const resumenDocumentos = !documentos.length ? 'Aún no hay documentos'
    : [plural(leidos, 'leído', 'leídos'), enLectura && `${enLectura} por leer`, conError && plural(conError, 'con error', 'con error')].filter(Boolean).join(' · ');
  const pasos: { nombre: string; ancla: string; estado: string }[] = [
    { nombre: 'Plantilla', ancla: 'paso-plantilla', estado: conPlantilla ? (e.plantilla?.categoria ?? 'Plantilla personal') : 'Sin plantilla' },
    { nombre: 'Documentos', ancla: 'paso-documentos', estado: resumenDocumentos },
    { nombre: 'Observaciones', ancla: 'paso-observaciones', estado: conObservaciones ? 'Escritas' : 'Opcional' },
    { nombre: 'Generación', ancla: 'paso-observaciones', estado: enCurso ? `${enCurso.porcentaje} %` : version ? plural(version, 'versión', 'versiones') : 'Pendiente' },
    { nombre: 'Revisión', ancla: 'paso-revision', estado: resultado ? (criticas ? plural(criticas, 'crítica', 'críticas') : 'Sin críticas') : '—' },
  ];

  // ---- Panel «Siguiente paso» ----
  const descargaPrincipal = resultado && ultima && !enCurso;
  const quePasa = !conPlantilla ? 'La plantilla se eliminó de la biblioteca. Elija otra para continuar.'
    : enCurso ? 'La IA está generando la escritura.'
    : resultado ? (criticas ? `Revise las ${plural(criticas, 'advertencia crítica', 'advertencias críticas')} y lea la escritura completa antes de descargarla.` : 'Lea la escritura completa y compárela con los documentos antes de descargarla.')
    : ultima?.estado === 'ERROR' ? `La versión ${ultima.version} no se pudo generar. Revise el error y genere de nuevo.`
    : !documentos.length ? 'Cargue los documentos del negocio: de ellos toma la IA los datos que cambian en la plantilla.'
    : 'Todo listo. Escriba sus observaciones si hace falta y genere la escritura.';
  const panel = (
    <>
      <h2><span className="tres-lineas" aria-hidden="true" />Siguiente paso</h2>
      <p className="que-sigue">{quePasa}</p>
      {cancelada && <div className="aviso neutro" role="status"><Icono nombre="info" /><div>Se canceló la generación de la versión {cancelada.version}.{cancelada.error ? ` ${cancelada.error}` : ''} Puede generar de nuevo cuando quiera.</div></div>}
      {enCurso ? (
        <>
          <div className="progreso-general">
            <div className="fila"><span>Versión {enCurso.version} · {hace(enCurso.iniciada)}</span><strong>{enCurso.porcentaje} %</strong></div>
            <progress max={100} value={enCurso.porcentaje} aria-label="Avance de la generación">{enCurso.porcentaje} %</progress>
          </div>
          <ol className="etapas" aria-label="Etapas de la generación">
            {ETAPAS.map((nombre, i) => {
              const actual = etapaDe(enCurso.porcentaje);
              return (
                <li key={nombre} className={i < actual ? 'hecha' : i === actual ? 'actual' : undefined} aria-current={i === actual ? 'step' : undefined}>
                  <span className="marca-etapa" aria-hidden="true">{i < actual && <Icono nombre="check" tamano={12} />}</span>
                  <span>{nombre}{i === actual && <span className="detalle-etapa">{enCurso.detalle}…</span>}</span>
                </li>
              );
            })}
          </ol>
          <div className="aviso info" role="status"><Icono nombre="campana" /><div>Puede salir de esta página o cerrar la pestaña: la generación sigue y le avisaremos en <Link href="/notificaciones">Notificaciones</Link> al terminar.</div></div>
          {editable && (
            <BotonAccion
              accion={accionCancelarGeneracion.bind(null, id)} texto="Cancelar generación" textoPendiente="Cancelando…" icono="cerrar" clase="peligro-suave pequeno"
              confirmar={`¿Cancelar la generación de la versión ${enCurso.version}? Se detiene y no se crea la escritura. Los documentos ya leídos se conservan y puede generar de nuevo cuando quiera.`}
            />
          )}
        </>
      ) : !resultado && conPlantilla && (
        <ul className="lista-requisitos">
          <li className="hecho"><span className="marca-req" aria-hidden="true"><Icono nombre="check" tamano={12} /></span>Plantilla elegida</li>
          <li className={documentos.length && !enLectura ? 'hecho' : enLectura ? 'espera' : undefined}>
            <span className="marca-req" aria-hidden="true">{documentos.length > 0 && !enLectura && <Icono nombre="check" tamano={12} />}</span>
            <span>Documentos del negocio{documentos.length ? ` · ${resumenDocumentos}` : ''}{enLectura ? <span className="tenue"> (puede generar ya: la generación espera a que terminen)</span> : null}</span>
          </li>
          <li className={conObservaciones ? 'hecho' : undefined}><span className="marca-req" aria-hidden="true">{conObservaciones && <Icono nombre="check" tamano={12} />}</span>Observaciones <span className="tenue">(opcional)</span></li>
        </ul>
      )}
      {!conPlantilla && editable && <Link className="boton grande bloque" href={`/expedientes/${id}/plantilla`}><Icono nombre="biblioteca" tamano={18} />Elegir otra plantilla</Link>}
      {descargaPrincipal && <a className="boton grande bloque" href={`/api/generaciones/${ultima.id}`}><Icono nombre="descargar" tamano={18} />Descargar Word · v{ultima.version}</a>}
    </>
  );
  const pie = (
    <>
      {generaciones.length > 1 && <a className="boton fantasma pequeno" href="#versiones"><Icono nombre="versiones" tamano={16} />Ver las {generaciones.length} versiones</a>}
      <p className="responsabilidad"><Icono nombre="auditoria" tamano={16} /><span>La IA prepara, verifica y advierte. El notario revisa, firma y responde por la escritura.</span></p>
    </>
  );

  return (
    <>
      <div className="cabecera-escritura">
        <div>
          <Link className="migas" href="/expedientes"><Icono nombre="atras" tamano={16} />Escrituras</Link>
          <div className="radicado">{e.numeroInterno}</div>
          <h1>{e.titulo || <span className="sin-titulo">Escritura sin título</span>}</h1>
          <p className="tenue sin-margen">Responsable: {e.responsable.nombreCompleto} · creada {fecha(e.creadoEn)}</p>
        </div>
        <div className="acciones-cabecera">
          <EtiquetaVersion g={generaciones[0]} />
          {e.eliminadoEn && esAdmin && <BotonAccion accion={accionRestaurarExpediente.bind(null, id)} texto="Restaurar" textoPendiente="Restaurando…" icono="atras" clase="secundario pequeno" confirmar={`¿Restaurar esta escritura? ${e.responsable.nombreCompleto} vuelve a verla en su lista y puede seguir trabajándola.`} />}
          {esAdmin && (editable || e.eliminadoEn) ? (
            <BotonAccion accion={accionEliminarExpediente.bind(null, id)} texto="Borrar definitivamente" icono="papelera" clase="peligro-suave pequeno" confirmar="¿Borrar definitivamente esta escritura? Se borran sus documentos y todas sus versiones. No se puede deshacer." />
          ) : editable && (
            <BotonAccion accion={accionEliminarExpediente.bind(null, id)} texto="Eliminar escritura" icono="papelera" clase="peligro-suave pequeno" confirmar="¿Eliminar esta escritura? Dejará de aparecer en su lista de escrituras." />
          )}
        </div>
      </div>
      {e.eliminadoEn && (
        <div className="aviso error" role="status"><Icono nombre="papelera" /><div>
          <strong>Eliminada por el usuario</strong>{e.eliminadoPor ? ` (${e.eliminadoPor.nombreCompleto})` : ''} el {fecha(e.eliminadoEn)}. El responsable ya no la ve; usted la ve en solo lectura. Puede restaurarla o borrarla definitivamente.
        </div></div>
      )}
      {(enCurso || leyendo) && <RefrescoAutomatico segundos={enCurso ? 5 : 8} />}

      <nav className="tarjeta pasos" aria-label="Pasos de la escritura">
        <ol className="pasos-escritura">
          {pasos.map((p, i) => (
            <li key={p.nombre} className={estadoPaso[i]}>
              <a href={`#${p.ancla}`} aria-current={pasoActual === i + 1 ? 'step' : undefined}>
                <span className="marca-paso" aria-hidden="true">{estadoPaso[i] === 'hecho' ? <Icono nombre="check" tamano={16} /> : i + 1}</span>
                <span className="nombre-paso">{p.nombre}</span>
                <span className="estado-paso">{p.estado}</span>
              </a>
            </li>
          ))}
        </ol>
        <p className="paso-de">Paso {pasoActual} de 5 · {pasos[pasoActual - 1]!.nombre}</p>
      </nav>

      <div className="escritura">
        {/* 1. Plantilla */}
        <section id="paso-plantilla" className={`paso orden-1 ${conPlantilla ? 'hecho' : 'actual'}`}>
          <div className="cabeza-paso">
            <span className="numero-paso" aria-hidden="true">{conPlantilla ? <Icono nombre="check" tamano={16} /> : 1}</span>
            <span className="titulo-paso"><h2>Plantilla</h2></span>
          </div>
          <div className="cuerpo-paso">
            <div className="plantilla-elegida">
              <span className="icono-doc"><Icono nombre="plantilla" tamano={22} /></span>
              <div className="datos">
                <strong>{e.plantillaNombre}</strong>
                <div className="fila chica tenue">
                  {e.plantilla ? <>
                    <span className="etiqueta dato">{e.plantilla.categoria}</span>
                    {e.plantilla.subcategoria && <span className="etiqueta dato">{e.plantilla.subcategoria}</span>}
                    <span>{fecha(e.plantilla.fecha, false)}</span>
                    {!e.plantilla.activa && <span className="etiqueta advertencia">Retirada de la biblioteca</span>}
                  </> : e.plantillaRuta ? 'Plantilla personal cargada por el digitador' : <span className="texto-peligro">La plantilla se eliminó de la biblioteca: elija otra.</span>}
                </div>
              </div>
              <div className="fila chica">
                {conPlantilla && <a className="boton secundario pequeno" href={`/api/expedientes/${id}/plantilla`}><Icono nombre="descargar" tamano={16} />Descargar</a>}
                {editable && !enCurso && conPlantilla && <Link className="boton secundario pequeno" href={`/expedientes/${id}/plantilla`}><Icono nombre="refrescar" tamano={16} />Cambiar</Link>}
              </div>
            </div>
            {conPlantilla && <VistaPlegable url={`/api/expedientes/${id}/plantilla?vista=1`} titulo="Ver la plantilla" />}
          </div>
        </section>

        {/* 2. Documentos del negocio */}
        <details id="paso-documentos" className={`paso orden-2 ${estadoPaso[1]}`} open={!resultado || !documentos.length || conError > 0 || enLectura > 0}>
          <summary>
            <span className="numero-paso" aria-hidden="true">{estadoPaso[1] === 'hecho' ? <Icono nombre="check" tamano={16} /> : 2}</span>
            <span className="titulo-paso"><h2>Documentos del negocio {documentos.length > 0 && <span className="conteo">{documentos.length}</span>}</h2><span className="resumen">{resumenDocumentos}</span></span>
          </summary>
          <div className="cuerpo-paso">
            {!documentos.length && <p className="suave">La IA toma de los documentos los datos que cambian en la plantilla: personas, inmueble, linderos, valores, banco…</p>}
            {documentos.length > 0 && (
              <ul className="lista-documentos">
                {documentos.map((d) => {
                  const est = ESTADO_LECTURA[d.estadoLectura] ?? { texto: d.estadoLectura, clase: '', li: '' };
                  const leido = d.estadoLectura === 'LEIDO' && d.lectura ? lecturaComoTexto('D', d.nombreOriginal, d.lectura as unknown as Lectura) : '';
                  const tipos = d.estadoLectura === 'LEIDO' ? ((d.lectura as unknown as Lectura | null)?.documentos ?? []).map((x) => x.tipo).filter(Boolean) : [];
                  return (
                    <li key={d.id} className={est.li || undefined}>
                      <span className="icono-doc" aria-hidden="true"><Icono nombre={d.estadoLectura === 'ERROR' ? 'alerta' : iconoArchivo(d.nombreOriginal)} tamano={18} /></span>
                      <div className="nombre">
                        <a href={`/api/documentos/${d.id}`} target="_blank" rel="noopener">{d.nombreOriginal}</a>
                        <div className="tenue">{tamano(d.tamano)}{d.paginas ? ` · ${d.paginas} pág.` : ''}{tipos.length ? ` · ${[...new Set(tipos)].slice(0, 4).join(', ')}` : ''}</div>
                      </div>
                      <div className="estado-doc">
                        <span className={`etiqueta ${est.clase}`}>{est.texto}</span>
                        {editable && d.estadoLectura === 'ERROR' && <BotonAccion accion={accionReleerDocumento.bind(null, id, d.id)} texto="Leer de nuevo" icono="refrescar" clase="secundario pequeno" />}
                        {editable && !enCurso && <BotonAccion accion={accionEliminarDocumento.bind(null, id, d.id)} texto="Retirar" icono="papelera" clase="peligro-suave pequeno" confirmar={`¿Retirar «${d.nombreOriginal}»? La IA dejará de usar sus datos.`} />}
                      </div>
                      {d.estadoLectura === 'ERROR' && d.errorLectura && <div className="error">{d.errorLectura}</div>}
                      {leido && <div className="detalle-doc"><details><summary>Ver lo que leyó la IA</summary><pre>{leido}</pre></details></div>}
                    </li>
                  );
                })}
              </ul>
            )}
            {editable && <FormularioCarga expedienteId={id} completar={accionCompletarDocumento.bind(null, id)} />}
          </div>
        </details>

        {/* 3. Observaciones y 4. Generación (con el panel «Siguiente paso») */}
        {editable && !enCurso ? (
          <FormularioObservaciones
            inicial={e.observaciones ?? ''}
            guardar={accionGuardarObservaciones.bind(null, id)}
            generar={accionGenerar.bind(null, id)}
            puedeGenerar={conPlantilla}
            version={version}
            abierto={!resultado}
            clasePaso={estadoPaso[2]!}
            resumen={conObservaciones ? e.observaciones!.slice(0, 120) : 'Opcional: lo que no está en los documentos'}
            panel={panel}
            pie={pie}
            generarPrincipal={!descargaPrincipal && conPlantilla}
          />
        ) : (
          <>
            <section id="paso-observaciones" className={`paso orden-3 ${estadoPaso[2]}`}>
              <div className="cabeza-paso">
                <span className="numero-paso" aria-hidden="true">{estadoPaso[2] === 'hecho' ? <Icono nombre="check" tamano={16} /> : 3}</span>
                <span className="titulo-paso"><h2>Observaciones</h2></span>
              </div>
              <div className="cuerpo-paso"><p className="suave">{e.observaciones ? e.observaciones : 'Sin observaciones.'}</p></div>
            </section>
            <aside className="panel-accion" aria-label="Siguiente paso">{panel}{pie}</aside>
          </>
        )}

        {/* 5. Revisión */}
        {ultima && (
          <section id="paso-revision" className={`paso ${resultado ? 'actual' : ''}`} aria-live="polite">
            <div className="cabeza-paso">
              <span className="numero-paso" aria-hidden="true">5</span>
              <span className="titulo-paso">
                <h2>Revisión · versión {ultima.version}</h2>
                <span className="resumen">Generada {fecha(ultima.creadaEn)} por {ultima.generadaPor.nombreCompleto} sobre «{ultima.plantillaNombre}»</span>
              </span>
            </div>
            <div className="cuerpo-paso">
              {ultima.estado === 'ERROR' && <div className="aviso error" role="alert"><Icono nombre="error" /><div>La versión {ultima.version} no se pudo generar: {ultima.error}</div></div>}
              {resultado && (
                <>
                  {resultado.resumen && <p className="resumen-ia">{resultado.resumen}</p>}
                  <div className="cifras-cambios">
                    <span><Icono nombre="editar" tamano={16} />{plural(resultado.cambios?.aplicados ?? 0, 'cambio', 'cambios')} sobre la plantilla</span>
                    {!!resultado.cambios?.eliminados && <span>{plural(resultado.cambios.eliminados, 'párrafo retirado', 'párrafos retirados')}</span>}
                    {!!resultado.cambios?.insertados && <span>{plural(resultado.cambios.insertados, 'párrafo agregado', 'párrafos agregados')}</span>}
                    <span><Icono nombre="documento" tamano={16} />{resultado.documentos?.leidos ?? 0} de {resultado.documentos?.total ?? 0} documento(s) usado(s)</span>
                  </div>
                  <div className="cifras-revision" aria-label="Resumen de la revisión">
                    {NIVELES.map((n) => <span key={n.nivel} className={`etiqueta ${n.clase}`}>{conteoNivel(n.nivel)} {n.titulo.toLowerCase()}</span>)}
                    {resultado.faltantes?.length ? <span className="etiqueta falta">{resultado.faltantes.length} «FALTA»</span> : <span className="etiqueta ok">Sin datos faltantes</span>}
                  </div>

                  {!advertencias.length ? (
                    <div className="aviso neutro"><Icono nombre="info" /><div>La IA no encontró advertencias. Revise de todas formas la escritura completa antes de imprimirla.</div></div>
                  ) : NIVELES.map((n) => {
                    const lista = advertencias.filter((a) => a.nivel === n.nivel);
                    if (!lista.length) return null;
                    return (
                      <div key={n.nivel} className="grupo-advertencias">
                        <h3>{n.titulo} <span className="conteo">{lista.length}</span></h3>
                        <ul className="advertencias">
                          {lista.map((a, i) => (
                            <li key={i} className={n.clase}>
                              <Icono nombre={n.icono} />
                              <div>
                                {a.detalle}
                                {(a.p > 0 || a.origen === 'SISTEMA') && (
                                  <div className="meta-advertencia">
                                    {a.p > 0 && <span>Párrafo {a.p}</span>}
                                    {a.origen === 'SISTEMA' && <span>Verificación automática</span>}
                                  </div>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}

                  {resultado.otorgantes?.length > 0 && (
                    <details>
                      <summary>{plural(resultado.otorgantes.length, 'otorgante identificado', 'otorgantes identificados')}</summary>
                      <ul className="hallazgos">{resultado.otorgantes.map((o, i) => <li key={i}><strong>{o.nombre}</strong>{o.documento && <> · {o.documento}</>}{o.papel && <span className="tenue"> · {o.papel}</span>}</li>)}</ul>
                    </details>
                  )}
                  {resultado.completados?.length > 0 && (
                    <details>
                      <summary>{plural(resultado.completados.length, 'dato que faltaba y se encontró', 'datos que faltaban y se encontraron')} en los documentos</summary>
                      <ul className="hallazgos">{resultado.completados.map((c, i) => <li key={i}><strong>{c.dato}:</strong> {c.valor} <span className="tenue">({c.fuente})</span></li>)}</ul>
                    </details>
                  )}
                  <VistaPlegable url={`/api/generaciones/${ultima.id}?vista=1`} titulo="Escritura generada (vista previa)" abierta leyenda />
                  {editable && !enCurso && cambiosDeVersion(ultima) && <CorregirVersion corregir={accionCorregirVersion.bind(null, id)} version={ultima.version} siguiente={version + 1} />}
                </>
              )}
            </div>
          </section>
        )}

        {/* Versiones anteriores: se conservan todas */}
        {generaciones.length > 1 && (
          <section id="versiones" className="tarjeta">
            <div className="tarjeta-cabecera"><h2><Icono nombre="versiones" />Versiones <span className="conteo">{generaciones.length}</span></h2></div>
            <Tabla>
              <thead><tr><th>Versión</th><th>Fecha</th><th>Por</th><th>Plantilla</th><th>Revisión</th><th></th></tr></thead>
              <tbody>
                {generaciones.map((g) => {
                  const r = g.resultado as unknown as ResultadoGeneracion | null;
                  const cuenta = (nivel: string) => r?.advertencias?.filter((a) => a.nivel === nivel).length ?? 0;
                  return (
                    <tr key={g.id}>
                      <td className="principal-celda"><strong>v{g.version}</strong>{correccionDe(g) && <span className="tenue"> · corrección de v{correccionDe(g)}</span>}{g.id === ultima?.id && <span className="tenue"> · la más reciente</span>}</td>
                      <td data-etiqueta="Fecha">{fecha(g.creadaEn)}</td>
                      <td data-etiqueta="Por">{g.generadaPor.nombreCompleto}</td>
                      <td data-etiqueta="Plantilla">{g.plantillaNombre}</td>
                      <td data-etiqueta="Revisión">
                        {g.estado === 'COMPLETADA' ? (
                          <span className="fila chica">
                            {cuenta('CRITICA') > 0 && <span className="etiqueta critica">{cuenta('CRITICA')}</span>}
                            {cuenta('ADVERTENCIA') > 0 && <span className="etiqueta advertencia">{cuenta('ADVERTENCIA')}</span>}
                            {cuenta('INFORMATIVA') > 0 && <span className="etiqueta informativa">{cuenta('INFORMATIVA')}</span>}
                            {!r?.advertencias?.length && <span className="etiqueta ok">Sin advertencias</span>}
                            {!!r?.faltantes?.length && <span className="etiqueta falta">{r.faltantes.length} FALTA</span>}
                          </span>
                        ) : g.estado === 'ERROR' ? <span className="etiqueta critica">Error</span> : g.estado === 'CANCELADA' ? <span className="etiqueta">Cancelada</span> : <span className="etiqueta informativa gira">Generando</span>}
                      </td>
                      <td className="acciones">{g.rutaDocx && <a className="boton secundario pequeno" href={`/api/generaciones/${g.id}`}><Icono nombre="descargar" tamano={16} />Word</a>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          </section>
        )}
      </div>
    </>
  );
}
