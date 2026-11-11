import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { expedienteDePagina, puedeEditar, ErrorNegocio } from '@/lib/servicios/expedientes';
import { generacionEnCurso, generacionPorReanudar, type ResultadoGeneracion } from '@/lib/servicios/generacion';
import { leerDocumento, LECTURA_CORTADA_MS } from '@/lib/servicios/documentos';
import { lecturaComoTexto, type Lectura } from '@/lib/ia/instrucciones';
import { EtiquetaNivel, Tabla, fecha } from '../../componentes';
import { VistaPlegable } from '../../plantillas/VistaPlegable';
import { BotonAccion, FormularioCarga, RefrescoAutomatico } from '../formularios';
import { FormularioObservaciones } from './Observaciones';
import {
  accionCompletarDocumento, accionEliminarDocumento, accionReleerDocumento, accionGuardarObservaciones, accionGenerar, accionEliminarExpediente,
} from '../acciones';

// Las acciones de esta página (cargar, generar) siguen trabajando en segundo plano después de responder
export const maxDuration = 300;

const ESTADO_LECTURA: Record<string, { texto: string; clase: string }> = {
  PENDIENTE: { texto: 'Por leer', clase: '' },
  EN_CURSO: { texto: 'Leyendo…', clase: 'informativa' },
  LEIDO: { texto: 'Leído', clase: 'ok' },
  ERROR: { texto: 'No se pudo leer', clase: 'critica' },
};

const tamano = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function Escritura({ params }: { params: Promise<{ id: string }> }) {
  const s = await requerirSesion();
  const { id } = await params;
  let e: Awaited<ReturnType<typeof expedienteDePagina>>;
  try { e = await expedienteDePagina(s, id); } catch (err) { if (err instanceof ErrorNegocio) notFound(); throw err; }
  const editable = puedeEditar(s, e);

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
  const ultima = generaciones.find((g) => g.estado !== 'EN_CURSO');
  const resultado = ultima?.estado === 'COMPLETADA' ? (ultima.resultado as unknown as ResultadoGeneracion) : null;
  const version = generaciones[0]?.version ?? 0;
  const criticas = resultado?.advertencias.filter((a) => a.nivel === 'CRITICA').length ?? 0;

  return (
    <>
      <div className="fila entre encabezado">
        <div>
          <h1><span className="radicado">{e.numeroInterno}</span> {e.titulo && <span>{e.titulo}</span>}</h1>
          <p className="suave">Responsable: {e.responsable.nombreCompleto} · creada {fecha(e.creadoEn)}</p>
        </div>
        {editable && <BotonAccion accion={accionEliminarExpediente.bind(null, id)} texto="Eliminar escritura" clase="secundario pequeno" confirmar="¿Eliminar esta escritura con sus documentos y versiones? No se puede deshacer." />}
      </div>
      {(enCurso || leyendo) && <RefrescoAutomatico segundos={enCurso ? 5 : 8} />}

      <section className="tarjeta paso-escritura">
        <h2><span className="numero-paso">1</span> Plantilla</h2>
        <div className="fila entre">
          <div>
            <strong>{e.plantillaNombre}</strong>
            <div className="suave">
              {e.plantilla ? <>{e.plantilla.categoria}{e.plantilla.subcategoria ? ` · ${e.plantilla.subcategoria}` : ''} · {fecha(e.plantilla.fecha, false)}{!e.plantilla.activa && <> · <span className="etiqueta advertencia">retirada de la biblioteca</span></>}</>
                : e.plantillaRuta ? 'Plantilla personal cargada por el digitador' : <span className="texto-peligro">La plantilla se eliminó de la biblioteca: elija otra.</span>}
            </div>
          </div>
          <div className="fila">
            {(e.plantillaId || e.plantillaRuta) && <a className="boton secundario pequeno" href={`/api/expedientes/${id}/plantilla`}>Descargar</a>}
            {editable && !enCurso && <Link className="boton secundario pequeno" href={`/expedientes/${id}/plantilla`}>Cambiar plantilla</Link>}
          </div>
        </div>
        {(e.plantillaId || e.plantillaRuta) && <VistaPlegable url={`/api/expedientes/${id}/plantilla?vista=1`} titulo="Ver la plantilla" />}
      </section>

      <section className="tarjeta paso-escritura">
        <h2><span className="numero-paso">2</span> Documentos del negocio</h2>
        {!documentos.length && <p className="suave">Aún no hay documentos. La IA toma de ellos los datos que cambian en la plantilla.</p>}
        <ul className="lista-documentos">
          {documentos.map((d) => {
            const est = ESTADO_LECTURA[d.estadoLectura] ?? { texto: d.estadoLectura, clase: '' };
            const leido = d.estadoLectura === 'LEIDO' && d.lectura ? lecturaComoTexto('D', d.nombreOriginal, d.lectura as unknown as Lectura) : '';
            const tipos = d.estadoLectura === 'LEIDO' ? ((d.lectura as unknown as Lectura | null)?.documentos ?? []).map((x) => x.tipo).filter(Boolean) : [];
            return (
              <li key={d.id}>
                <div className="nombre">
                  <a href={`/api/documentos/${d.id}`} target="_blank" rel="noopener">{d.nombreOriginal}</a>
                  <div className="suave">{tamano(d.tamano)}{d.paginas ? ` · ${d.paginas} pág.` : ''}{tipos.length ? ` · ${[...new Set(tipos)].slice(0, 4).join(', ')}` : ''}</div>
                  {d.estadoLectura === 'ERROR' && d.errorLectura && <div className="error">{d.errorLectura}</div>}
                  {leido && <details><summary>Ver lo que leyó la IA</summary><pre>{leido}</pre></details>}
                </div>
                <div className="fila">
                  <span className={`etiqueta ${est.clase}`}>{est.texto}</span>
                  {editable && d.estadoLectura === 'ERROR' && <BotonAccion accion={accionReleerDocumento.bind(null, id, d.id)} texto="Leer de nuevo" clase="secundario pequeno" />}
                  {editable && !enCurso && <BotonAccion accion={accionEliminarDocumento.bind(null, id, d.id)} texto="Retirar" clase="secundario pequeno" confirmar={`¿Retirar «${d.nombreOriginal}»?`} />}
                </div>
              </li>
            );
          })}
        </ul>
        {editable && <FormularioCarga expedienteId={id} completar={accionCompletarDocumento.bind(null, id)} />}
      </section>

      <section className="tarjeta paso-escritura">
        <h2><span className="numero-paso">3</span> Observaciones y generación</h2>
        {enCurso ? (
          <div className="aviso info progreso-analisis" role="status">
            <div className="fila entre"><span>{enCurso.detalle}…</span><strong>{enCurso.porcentaje} %</strong></div>
            <progress max={100} value={enCurso.porcentaje} aria-label="Avance de la generación">{enCurso.porcentaje} %</progress>
            <div className="suave">Versión {enCurso.version}, iniciada {fecha(enCurso.iniciada)}. Puede salir de esta página: le avisaremos en «Notificaciones» al terminar.</div>
          </div>
        ) : editable ? (
          <>
            {leyendo && <div className="aviso info">La IA aún está leyendo algunos documentos. Puede generar ya: la generación espera a que terminen.</div>}
            <FormularioObservaciones inicial={e.observaciones ?? ''} guardar={accionGuardarObservaciones.bind(null, id)} generar={accionGenerar.bind(null, id)} puedeGenerar={!!(e.plantillaId || e.plantillaRuta)} version={version} />
          </>
        ) : (
          <p className="suave">{e.observaciones ? <>Observaciones: {e.observaciones}</> : 'Sin observaciones.'}</p>
        )}
      </section>

      {ultima && (
        <section className="tarjeta paso-escritura" aria-live="polite">
          <h2><span className="numero-paso">4</span> Escritura generada · versión {ultima.version}</h2>
          {ultima.estado === 'ERROR' && <div className="aviso error">La versión {ultima.version} no se pudo generar: {ultima.error}</div>}
          {resultado && (
            <>
              <div className="fila entre">
                <p className="suave">Generada {fecha(ultima.creadaEn)} por {ultima.generadaPor.nombreCompleto} sobre «{ultima.plantillaNombre}».</p>
                <a className="boton" href={`/api/generaciones/${ultima.id}`}>Descargar Word</a>
              </div>
              {resultado.resumen && <p>{resultado.resumen}</p>}
              <p className="suave">
                {resultado.cambios.aplicados} cambio(s) sobre la plantilla{resultado.cambios.eliminados ? `, ${resultado.cambios.eliminados} párrafo(s) retirado(s)` : ''}{resultado.cambios.insertados ? `, ${resultado.cambios.insertados} agregado(s)` : ''}
                {' · '}{resultado.documentos.leidos} de {resultado.documentos.total} documento(s) usado(s)
                {resultado.faltantes.length ? <> · <span className="etiqueta advertencia">{resultado.faltantes.length} «FALTA»</span></> : <> · <span className="etiqueta ok">sin datos faltantes</span></>}
              </p>
              <h3>Revisión y advertencias {criticas > 0 && <span className="etiqueta critica">{criticas} crítica(s)</span>}</h3>
              {!resultado.advertencias.length ? <p className="suave">La IA no encontró advertencias. Revise de todas formas la escritura antes de imprimirla.</p> : (
                <ul className="advertencias">
                  {resultado.advertencias.map((a, i) => (
                    <li key={i}><EtiquetaNivel nivel={a.nivel} /><span>{a.detalle}{a.origen === 'SISTEMA' && <span className="suave"> (verificación automática)</span>}</span></li>
                  ))}
                </ul>
              )}
              {resultado.completados.length > 0 && (
                <details>
                  <summary>{resultado.completados.length} dato(s) que faltaban y se encontraron en los documentos</summary>
                  <ul className="hallazgos">{resultado.completados.map((c, i) => <li key={i}><strong>{c.dato}:</strong> {c.valor} <span className="suave">({c.fuente})</span></li>)}</ul>
                </details>
              )}
              <VistaPlegable url={`/api/generaciones/${ultima.id}?vista=1`} titulo="Ver la escritura generada" abierta />
            </>
          )}
        </section>
      )}

      {generaciones.length > 1 && (
        <section className="tarjeta">
          <h2>Versiones</h2>
          <Tabla>
            <thead><tr><th>Versión</th><th>Fecha</th><th>Por</th><th>Plantilla</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {generaciones.map((g) => {
                const r = g.resultado as unknown as ResultadoGeneracion | null;
                return (
                  <tr key={g.id}>
                    <td className="principal-celda">v{g.version}</td>
                    <td data-etiqueta="Fecha">{fecha(g.creadaEn)}</td>
                    <td data-etiqueta="Por">{g.generadaPor.nombreCompleto}</td>
                    <td data-etiqueta="Plantilla">{g.plantillaNombre}</td>
                    <td data-etiqueta="Estado">{g.estado === 'COMPLETADA' ? <span className="etiqueta ok">{r?.advertencias.length ?? 0} advertencia(s)</span> : g.estado === 'ERROR' ? <span className="etiqueta critica">Error</span> : <span className="etiqueta informativa">Generando</span>}</td>
                    <td>{g.rutaDocx && <a href={`/api/generaciones/${g.id}`}>Descargar</a>}</td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        </section>
      )}
    </>
  );
}
