import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { expedienteDePagina, puedeEditar, bloqueos } from '@/lib/servicios/expedientes';
import { redaccionEnCurso, ultimaRedaccion, type InfoRedaccion } from '@/lib/servicios/redaccion';
import { accionGenerarBorrador } from '../../acciones';
import { BotonAccion, RefrescoAutomatico } from '../../formularios';
import { Tabla, fecha } from '../../../componentes';
import { VisorDocx } from '../../../plantillas/VisorDocx';

// La IA redacta la escritura en segundo plano (after) tras responder la acción
export const maxDuration = 300;

export default async function Borrador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requerirSesion();
  const e = await expedienteDePagina(s, id);
  const [versiones, b, enCurso, ultimaIA] = await Promise.all([
    db.borrador.findMany({ where: { expedienteId: id }, orderBy: { version: 'desc' } }),
    bloqueos(id),
    redaccionEnCurso(id),
    ultimaRedaccion(id),
  ]);
  const ultimo = versiones[0];
  const desactualizado = ultimo && ultimo.creadoEn < e.actualizadoEn;
  const info = ultimo?.redaccion as InfoRedaccion | null | undefined;
  // Las marcas «FALTA» del borrador anterior no impiden redactar de nuevo
  const criticas = b.criticas.filter((o) => o.codigo !== 'R12-BORRADOR-INCOMPLETO');
  return (
    <>
      <section className="tarjeta">
        <h2>Borrador de la escritura</h2>
        <p className="suave">La IA redacta la escritura tomando como base la plantilla APROBADA por el notario para este tipo de acto (su estructura, cláusulas y forma de redactar), con los datos del expediente, de los documentos y las respuestas del asistente. No copia los datos del modelo: lo que no encuentra lo deja marcado «FALTA». Revise siempre el texto completo antes de enviarlo.</p>
        {criticas.length > 0 && <div className="aviso error">Hay {criticas.length} observación(es) crítica(s) abiertas: no se puede redactar la escritura hasta corregirlas.</div>}
        {enCurso ? (
          <div className="aviso info" role="status">
            <RefrescoAutomatico segundos={8} />
            <span className="girador pequeno" aria-hidden="true" /> La IA está redactando la escritura (iniciada {fecha(enCurso.creadoEn)}). Tarda unos minutos; puede salir de esta página: le avisaremos en «Notificaciones» al terminar.
          </div>
        ) : (
          <>
            {ultimaIA?.estado === 'ERROR' && <div className="aviso error">La última redacción no se completó: {ultimaIA.error}</div>}
            {desactualizado && <div className="aviso alerta">Los datos cambiaron después del último borrador. Redáctelo de nuevo antes de enviarlo a revisión.</div>}
            {puedeEditar(s, e) && <BotonAccion accion={accionGenerarBorrador.bind(null, id)} texto={ultimo ? 'Redactar nueva versión con IA' : 'Redactar escritura con IA'} textoPendiente="Iniciando…" />}
          </>
        )}
      </section>
      {ultimo && info && (
        <section className="tarjeta">
          <h3 style={{ marginTop: 0 }}>Redacción de la versión {ultimo.version}</h3>
          <p>{info.resumen}</p>
          {info.faltantes.length > 0 && (
            <div className="aviso error">
              Faltan {info.faltantes.length} dato(s), marcados «FALTA» en el texto. Complételos (en el asistente o en las indicaciones del acto) y redacte de nuevo:
              <ul>{info.faltantes.map((f, i) => <li key={i}><strong>{f.dato}</strong>{f.motivo ? ` — ${f.motivo}` : ''}</li>)}</ul>
            </div>
          )}
          {info.advertencias.length > 0 && (
            <div className="aviso alerta">
              Revise con cuidado:
              <ul>{info.advertencias.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          )}
          <p className="suave">Redactada por {info.modelo}.</p>
        </section>
      )}
      {versiones.length > 0 && (
        <section className="tarjeta">
          <h3 style={{ marginTop: 0 }}>Versiones</h3>
          <Tabla>
            <thead><tr><th>Versión</th><th>Fecha</th><th>Plantillas (modelos) usadas</th><th>Descargar</th></tr></thead>
            <tbody>{versiones.map((v) => (
              <tr key={v.id}>
                <td className="principal-celda"><strong>v{v.version}</strong>{v.id === ultimo?.id && <> <span className="etiqueta informativa">última</span></>}</td>
                <td data-etiqueta="Fecha">{fecha(v.creadoEn)}</td>
                <td data-etiqueta="Plantillas" className="suave">{(v.plantillasUsadas as { tipoId: string; version: number }[]).map((p) => `${p.tipoId} v${p.version}`).join(', ')}</td>
                <td data-etiqueta="Descargar">
                  <div className="fila" style={{ gap: '0.5rem' }}>
                    <a className="boton secundario pequeno" href={`/api/borradores/${v.id}?formato=docx`}>Word</a>
                    {v.rutaPdfCifrada && <a className="boton secundario pequeno" href={`/api/borradores/${v.id}?formato=pdf`} target="_blank" rel="noopener">PDF</a>}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </Tabla>
          <p className="suave">Cada descarga queda registrada en la auditoría.</p>
        </section>
      )}
      {ultimo && (
        <section className="tarjeta">
          <h3 style={{ marginTop: 0 }}>Vista previa (versión {ultimo.version})</h3>
          <p className="suave">Así se ve en Word: páginas, márgenes, encabezados y guiones de relleno.</p>
          {/* key: al generar una versión nueva, el visor se rehace con ella */}
          <VisorDocx key={ultimo.id} url={`/api/borradores/${ultimo.id}?vista=1`} />
        </section>
      )}
    </>
  );
}
