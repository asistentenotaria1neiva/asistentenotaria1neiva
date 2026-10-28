import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { after } from 'next/server';
import { obtenerExpediente, puedeEditar, actosDe } from '@/lib/servicios/expedientes';
import { tareaEnCurso, tareaPorReanudar, recuperarDocumentosTrabados } from '@/lib/servicios/tareas';
import { TIPOS_DOCUMENTALES, type DatoConFuente } from '@/lib/ia/documentos';
import { ESQUEMAS } from '@/lib/escritura/esquemas';
import { accionCompletarDocumento, accionAnalizarDocumento, accionAnalizarPendientes, accionEliminarDocumento } from '../../acciones';
import { FormularioCarga, BotonAccion } from '../../formularios';
import { ProgresoAnalisis } from '../progreso';

// La primera etapa del análisis de los pendientes corre en segundo plano (after) tras responder la acción
export const maxDuration = 300;
import { EtiquetaConfianza, Tabla } from '../../../componentes';

function Hechos({ hechos }: { hechos: Record<string, unknown> }) {
  const filas: [string, DatoConFuente][] = [];
  const recorrer = (obj: Record<string, unknown>, prefijo: string) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (v && typeof v === 'object' && 'confianza' in (v as object)) filas.push([prefijo + k, v as DatoConFuente]);
      else if (Array.isArray(v)) v.forEach((x, i) => recorrer(x as Record<string, unknown>, `${prefijo}${k} ${i + 1} · `));
      else if (v && typeof v === 'object') recorrer(v as Record<string, unknown>, `${prefijo}${k} · `);
    }
  };
  recorrer((hechos.datos ?? {}) as Record<string, unknown>, '');
  const obs = (hechos.observaciones as string[] | undefined) ?? [];
  return (
    <>
      {hechos.legible === false && <div className="aviso error">La IA indica que el documento no es legible con seguridad: verifique todos los datos manualmente.</div>}
      {obs.length > 0 && <div className="aviso alerta">Observaciones de la IA sobre el documento: {obs.join(' · ')}</div>}
      <Tabla>
        <thead><tr><th>Dato</th><th>Valor</th><th>Pág.</th><th>Fragmento de origen</th><th>Confianza</th></tr></thead>
        <tbody>{filas.filter(([, d]) => d.valor !== null).map(([k, d]) => (
          <tr key={k}>
            <td className="principal-celda"><strong>{k.replace(/_/g, ' ')}</strong></td>
            <td data-etiqueta="Valor">{String(d.valor)}</td>
            <td data-etiqueta="Página">{d.pagina ?? '—'}</td>
            <td data-etiqueta="Fragmento" className="suave">{d.fragmento ?? '—'}</td>
            <td data-etiqueta="Confianza"><EtiquetaConfianza confianza={d.confianza} /></td>
          </tr>
        ))}</tbody>
      </Tabla>
    </>
  );
}

export default async function Documentos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requerirSesion();
  const e = await obtenerExpediente(s, id);
  const editable = puedeEditar(s, e);
  // Un análisis que dejó de avanzar se reanuda; los documentos que quedaron «en curso» sin análisis vivo se recuperan
  if (editable) {
    const reanudar = await tareaPorReanudar(id);
    if (reanudar) after(reanudar);
    else await recuperarDocumentosTrabados(id);
  }
  const tarea = await tareaEnCurso(id);
  const docs = await db.documento.findMany({ where: { expedienteId: id }, orderBy: { creadoEn: 'asc' } });
  const requeridos = [...new Map(actosDe(e).flatMap((a) => ESQUEMAS[a]?.documentosSoporte ?? []).map((d) => [d.etiqueta, d])).values()];
  const pendientes = docs.filter((d) => d.estadoAnalisis === 'PENDIENTE' || d.estadoAnalisis === 'ERROR').length;
  const iaDisponible = !!process.env.ANTHROPIC_API_KEY;
  return (
    <>
      <section className="tarjeta">
        <h2>Documentos soporte requeridos</h2>
        <ul className="lista-estado">{requeridos.map((d) => {
          const cargado = docs.some((x) => x.tipoDocumental === d.tipo);
          return (
            <li key={d.etiqueta} className={cargado ? 'hecho' : d.obligatorio ? 'falta' : 'pendiente'}>
              <span className="marca-estado" aria-hidden="true">{cargado ? '✓' : d.obligatorio ? '!' : ''}</span>
              <span>{d.etiqueta}{!d.obligatorio && <span className="suave"> (si aplica)</span>}<span className="solo-lectores"> {cargado ? '(cargado)' : d.obligatorio ? '(falta, obligatorio)' : '(no cargado)'}</span></span>
            </li>
          );
        })}</ul>
      </section>
      {editable && (
        <section className="tarjeta">
          <h2>Cargar documentos</h2>
          <p className="suave">Los archivos se cifran al guardarse y solo el servidor puede leerlos. Para el análisis se envían a la API de Claude (ver docs/seguridad.md).</p>
          <FormularioCarga expedienteId={id} completar={accionCompletarDocumento.bind(null, id)} tipos={[['AUTO', 'Detectar automáticamente (un documento o un PDF con varios: la IA los identifica y separa)'],...Object.entries(TIPOS_DOCUMENTALES)]} />
          {!iaDisponible && <div className="aviso alerta">El análisis con IA no está disponible: falta configurar la clave de la API en el servidor.</div>}
          {tarea && <ProgresoAnalisis tarea={tarea} />}
          {iaDisponible && !tarea && pendientes > 0 && <BotonAccion accion={accionAnalizarPendientes.bind(null, id)} texto={`Analizar con IA los ${pendientes} documento(s) pendiente(s)`} textoPendiente="Iniciando…" />}
        </section>
      )}
      {docs.map((d) => {
        const partes = docs.filter((x) => x.origenId === d.id).length;
        const origen = d.origenId ? docs.find((x) => x.id === d.origenId) : undefined;
        return (
        <section className="tarjeta" key={d.id} id={`doc-${d.id}`}>
          <div className="fila entre">
            <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <strong>{d.nombreOriginal}</strong>
              <div className="suave">{d.estadoAnalisis === 'DIVIDIDO' ? `Varios documentos: la IA lo separó en ${partes} parte(s)` : TIPOS_DOCUMENTALES[d.tipoDocumental as keyof typeof TIPOS_DOCUMENTALES]} · {(d.tamano / 1024).toFixed(0)} KB</div>
              {d.paginaDesde && <div className="suave">Páginas {d.paginaDesde}–{d.paginaHasta} de {origen ? <a href={`#doc-${origen.id}`}>{origen.nombreOriginal}</a> : 'un archivo retirado'}</div>}
            </div>
            <div className="fila">
              <span className={`etiqueta ${d.estadoAnalisis === 'COMPLETADO' || d.estadoAnalisis === 'DIVIDIDO' ? 'ok' : d.estadoAnalisis === 'ERROR' ? 'critica' : ''}`}>{d.estadoAnalisis.toLowerCase().replace('_', ' ')}</span>
              <a className="boton secundario pequeno" href={`/api/documentos/${d.id}`} target="_blank" rel="noopener">Ver</a>
              {editable && <BotonAccion accion={accionEliminarDocumento.bind(null, id, d.id)} texto="Retirar" clase="secundario pequeno" confirmar={partes ? `¿Retirar el archivo completo «${d.nombreOriginal}»? Las ${partes} parte(s) separadas se conservan.` : `¿Retirar «${d.nombreOriginal}»? Podrá cargar el documento correcto en su lugar.`} />}
              {editable && iaDisponible && !tarea && d.estadoAnalisis !== 'EN_CURSO' && d.estadoAnalisis !== 'DIVIDIDO' && <BotonAccion accion={accionAnalizarDocumento.bind(null, id, d.id)} texto={d.estadoAnalisis === 'COMPLETADO' ? 'Analizar de nuevo' : 'Analizar con IA'} clase="pequeno" textoPendiente="Analizando…" />}
            </div>
          </div>
          {d.hechos ? <details><summary>Datos extraídos (con fuente y confianza)</summary><Hechos hechos={d.hechos as Record<string, unknown>} /></details> : null}
        </section>
        );
      })}
      {!docs.length && <p className="suave vacio tarjeta">Aún no hay documentos cargados.</p>}
      <div className="fila" style={{ justifyContent: 'flex-end' }}><Link className="boton" href={`/expedientes/${id}/asistente`}>Continuar con el asistente de IA →</Link></div>
    </>
  );
}
