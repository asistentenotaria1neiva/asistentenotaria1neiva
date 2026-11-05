import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { expedienteDePagina, puedeEditar, bloqueos } from '@/lib/servicios/expedientes';
import { redaccionEnCurso, ultimaRedaccion, CODIGO_REDACCION, type InfoRedaccion } from '@/lib/servicios/redaccion';
import { accionRedactar } from '../../acciones';
import { RefrescoAutomatico } from '../../formularios';
import { FormAdmin } from '../../../admin/formularios';
import { Tabla, fecha } from '../../../componentes';
import { VisorDocx } from '../../../plantillas/VisorDocx';

// La IA redacta la escritura en segundo plano (after) tras responder la acción
export const maxDuration = 300;

const NIVEL: Record<string, [string, string]> = { CRITICA: ['critica', 'Crítica'], REVISAR: ['advertencia', 'Revisar'], INFORMATIVA: ['informativa', 'Informativa'] };

export default async function Borrador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requerirSesion();
  const e = await expedienteDePagina(s, id);
  const [versiones, b, enCurso, ultimaIA, nDocs] = await Promise.all([
    db.borrador.findMany({ where: { expedienteId: id }, orderBy: { version: 'desc' } }),
    bloqueos(id),
    redaccionEnCurso(id),
    ultimaRedaccion(id),
    db.documento.count({ where: { expedienteId: id, origenId: null } }),
  ]);
  const ultimo = versiones[0];
  const desactualizado = ultimo && ultimo.creadoEn < e.actualizadoEn;
  const info = ultimo?.redaccion as Partial<InfoRedaccion> | null | undefined;
  // Las alertas y marcas «FALTA» de la versión anterior no impiden redactar de nuevo
  const criticas = b.criticas.filter((o) => o.codigo !== 'R12-BORRADOR-INCOMPLETO' && o.codigo !== CODIGO_REDACCION);
  const editable = puedeEditar(s, e);
  const alertas = info?.alertas ?? [];
  const orden = { CRITICA: 0, REVISAR: 1, INFORMATIVA: 2 } as Record<string, number>;
  return (
    <>
      <section className="tarjeta">
        <h2>Escritura</h2>
        <p className="suave">La IA lee los documentos cargados y redacta la escritura completa tomando como referencia la plantilla aprobada para este tipo de escritura. No hace preguntas: lo dudoso queda marcado <strong>[VERIFICAR]</strong> y lo que no está en los documentos, <strong>«FALTA»</strong>; todo aparece abajo como alerta. Lea siempre el texto completo antes de enviarlo.</p>
        {!nDocs && <div className="aviso alerta">Aún no hay documentos. <Link href={`/expedientes/${id}/documentos`}>Cárguelos</Link> (cédulas, certificado de tradición, paz y salvos, escritura anterior, hoja de radicación…).</div>}
        {criticas.length > 0 && <div className="aviso error">Hay {criticas.length} observación(es) crítica(s) abiertas: <Link href={`/expedientes/${id}/observaciones`}>revíselas</Link> antes de redactar.</div>}
        {enCurso ? (
          <div className="aviso info" role="status">
            <RefrescoAutomatico segundos={8} />
            <span className="girador pequeno" aria-hidden="true" /> La IA está leyendo los documentos y redactando la escritura (iniciada {fecha(enCurso.creadoEn)}). Tarda unos minutos; puede salir de esta página: le avisaremos en «Notificaciones» al terminar.
          </div>
        ) : (
          <>
            {ultimaIA?.estado === 'ERROR' && <div className="aviso error">La última redacción no se completó: {ultimaIA.error}</div>}
            {desactualizado && <div className="aviso alerta">Hubo cambios después de la última versión. Redáctela de nuevo antes de enviarla a revisión.</div>}
            {editable && nDocs > 0 && (
              <FormAdmin accion={accionRedactar.bind(null, id)}
                campos={[{ nombre: 'indicaciones', etiqueta: ultimo ? 'Indicaciones para la nueva versión (opcional)' : 'Indicaciones (opcional)', tipo: 'area', valor: info?.indicaciones ?? '',
                  ayuda: 'Lo que la IA debe tener en cuenta y no está en los documentos, o qué corregir de la versión anterior (p. ej. «el usufructuario vive en Palermo», «el lindero sur es 33B»).' }]}
                botones={[{ texto: ultimo ? 'Generar nueva versión' : 'Generar escritura' }]} mensajePendiente="Iniciando la redacción…" />
            )}
          </>
        )}
      </section>

      {ultimo && info && (
        <section className="tarjeta">
          <h3 style={{ marginTop: 0 }}>Versión {ultimo.version}</h3>
          {info.resumen && <p>{info.resumen}</p>}
          {(!!info.faltantes?.length || !!info.verificar?.length) && <p className="suave">En el Word, lo que falta y lo que toca verificar va <mark>resaltado en amarillo</mark> (lo que falta, además en negrilla). Búsquelos en Word con Ctrl+B por «FALTA» o «VERIFICAR».</p>}
          {!!info.faltantes?.length && <div className="aviso error">Faltan {info.faltantes.length} dato(s), marcados <mark><strong>«FALTA»</strong></mark> en el texto: {info.faltantes.join(', ')}. Cargue el documento o escríbalos en las indicaciones y genere de nuevo.</div>}
          {!!info.verificar?.length && (
            <div className="aviso alerta">
              {info.verificar.length} punto(s) por verificar, marcados <mark>[VERIFICAR]</mark> en el texto:
              <ul>{info.verificar.map((v, i) => <li key={i}>{v}</li>)}</ul>
            </div>
          )}
          {alertas.length > 0 ? (
            <Tabla>
              <thead><tr><th>Alerta</th><th>Dato o parte</th><th>Detalle</th></tr></thead>
              <tbody>{[...alertas].sort((x, y) => orden[x.nivel] - orden[y.nivel]).map((a, i) => (
                <tr key={i}>
                  <td><span className={`etiqueta ${NIVEL[a.nivel]?.[0] ?? ''}`}>{NIVEL[a.nivel]?.[1] ?? a.nivel}</span></td>
                  <td data-etiqueta="Dato" className="principal-celda">{a.campo}</td>
                  <td data-etiqueta="Detalle">{a.detalle}</td>
                </tr>
              ))}</tbody>
            </Tabla>
          ) : <p className="suave">La IA no dejó alertas.</p>}
          <p className="suave">Las alertas también están en <Link href={`/expedientes/${id}/observaciones`}>Observaciones</Link>: las críticas impiden enviar a revisión y las de «Revisar» se corrigen (generando una nueva versión) o se justifican.</p>
          {!!info.documentosNoUtilizados?.length && (
            <details><summary>Documentos que no se usaron ({info.documentosNoUtilizados.length})</summary>
              <ul>{info.documentosNoUtilizados.map((d, i) => <li key={i}><strong>{d.documento}</strong>: {d.motivo}</li>)}</ul>
            </details>
          )}
          {!!info.datosExtraidos?.length && (
            <details><summary>Datos que tomó de los documentos ({info.datosExtraidos.length})</summary>
              <Tabla>
                <thead><tr><th>Dato</th><th>Valor</th><th>Fuente</th></tr></thead>
                <tbody>{info.datosExtraidos.map((d, i) => (
                  <tr key={i}>
                    <td className="principal-celda"><span className="suave">{d.grupo} · </span>{d.dato}</td>
                    <td data-etiqueta="Valor" style={{ whiteSpace: 'pre-line' }}>{d.valor}</td>
                    <td data-etiqueta="Fuente" className="suave">{d.fuente}</td>
                  </tr>
                ))}</tbody>
              </Tabla>
            </details>
          )}
          {info.indicaciones && <p className="suave">Indicaciones usadas: {info.indicaciones}</p>}
          {info.modelo && <p className="suave">Redactada por {info.modelo}.</p>}
        </section>
      )}

      {ultimo && (
        <section className="tarjeta">
          <div className="fila entre">
            <h3 style={{ margin: 0 }}>Vista previa (versión {ultimo.version})</h3>
            <div className="fila" style={{ gap: '0.5rem' }}>
              <a className="boton pequeno" href={`/api/borradores/${ultimo.id}?formato=docx`}>Descargar Word</a>
              {ultimo.rutaPdfCifrada && <a className="boton secundario pequeno" href={`/api/borradores/${ultimo.id}?formato=pdf`} target="_blank" rel="noopener">PDF</a>}
            </div>
          </div>
          <p className="suave">Así se ve en Word: páginas, márgenes, encabezados y guiones de relleno.</p>
          {/* key: al generar una versión nueva, el visor se rehace con ella */}
          <VisorDocx key={ultimo.id} url={`/api/borradores/${ultimo.id}?vista=1`} />
        </section>
      )}

      {versiones.length > 1 && (
        <section className="tarjeta">
          <h3 style={{ marginTop: 0 }}>Versiones anteriores</h3>
          <Tabla>
            <thead><tr><th>Versión</th><th>Fecha</th><th>Plantilla usada</th><th>Descargar</th></tr></thead>
            <tbody>{versiones.slice(1).map((v) => (
              <tr key={v.id}>
                <td className="principal-celda"><strong>v{v.version}</strong></td>
                <td data-etiqueta="Fecha">{fecha(v.creadoEn)}</td>
                <td data-etiqueta="Plantilla" className="suave">{(v.plantillasUsadas as { tipoId: string; version: number }[]).map((p) => `${p.tipoId} v${p.version}`).join(', ')}</td>
                <td data-etiqueta="Descargar">
                  <a className="boton secundario pequeno" href={`/api/borradores/${v.id}?formato=docx`}>Word</a>
                </td>
              </tr>
            ))}</tbody>
          </Tabla>
          <p className="suave">Cada descarga queda registrada en la auditoría.</p>
        </section>
      )}
    </>
  );
}
