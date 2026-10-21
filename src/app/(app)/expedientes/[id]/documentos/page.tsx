import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { obtenerExpediente, puedeEditar, actosDe } from '@/lib/servicios/expedientes';
import { LIMITE_CARGA_MB } from '@/lib/servicios/documentos';
import { TIPOS_DOCUMENTALES, type DatoConFuente } from '@/lib/ia/documentos';
import { ESQUEMAS } from '@/lib/escritura/esquemas';
import { accionSubirDocumento, accionAnalizarDocumento, accionAnalizarPendientes } from '../../acciones';
import { FormularioCarga, BotonAccion } from '../../formularios';
import { EtiquetaConfianza } from '../../../componentes';

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
      <table>
        <thead><tr><th>Dato</th><th>Valor</th><th>Pág.</th><th>Fragmento de origen</th><th>Confianza</th></tr></thead>
        <tbody>{filas.filter(([, d]) => d.valor !== null).map(([k, d]) => (
          <tr key={k}><td>{k.replace(/_/g, ' ')}</td><td>{String(d.valor)}</td><td>{d.pagina ?? '—'}</td><td className="suave">{d.fragmento ?? '—'}</td><td><EtiquetaConfianza confianza={d.confianza} /></td></tr>
        ))}</tbody>
      </table>
    </>
  );
}

export default async function Documentos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requerirSesion();
  const e = await obtenerExpediente(s, id);
  const docs = await db.documento.findMany({ where: { expedienteId: id }, orderBy: { creadoEn: 'asc' } });
  const editable = puedeEditar(s, e);
  const requeridos = [...new Map(actosDe(e).flatMap((a) => ESQUEMAS[a]?.documentosSoporte ?? []).map((d) => [d.etiqueta, d])).values()];
  const pendientes = docs.filter((d) => d.estadoAnalisis === 'PENDIENTE' || d.estadoAnalisis === 'ERROR').length;
  const iaDisponible = !!process.env.ANTHROPIC_API_KEY;
  return (
    <>
      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Documentos soporte requeridos</h2>
        <ul>{requeridos.map((d) => {
          const cargado = docs.some((x) => x.tipoDocumental === d.tipo);
          return <li key={d.etiqueta}>{cargado ? '✔' : d.obligatorio ? '✖' : '○'} {d.etiqueta}{!d.obligatorio && <span className="suave"> (si aplica)</span>}</li>;
        })}</ul>
      </section>
      {editable && (
        <section className="tarjeta">
          <h2 style={{ marginTop: 0 }}>Cargar documentos</h2>
          <p className="suave">Los archivos se cifran al guardarse y solo el servidor puede leerlos. Para el análisis se envían a la API de Claude (ver docs/seguridad.md).</p>
          <FormularioCarga accion={accionSubirDocumento.bind(null, id)} tipos={Object.entries(TIPOS_DOCUMENTALES)} limiteMb={LIMITE_CARGA_MB} />
          {!iaDisponible && <div className="aviso alerta">El análisis con IA no está disponible: falta configurar la clave de la API en el servidor.</div>}
          {iaDisponible && pendientes > 0 && <BotonAccion accion={accionAnalizarPendientes.bind(null, id)} texto={`Analizar con IA los ${pendientes} documento(s) pendiente(s)`} textoPendiente="Analizando… (puede tardar varios minutos)" />}
        </section>
      )}
      {docs.map((d) => (
        <section className="tarjeta" key={d.id}>
          <div className="fila entre">
            <div><strong>{d.nombreOriginal}</strong> <span className="suave">· {TIPOS_DOCUMENTALES[d.tipoDocumental as keyof typeof TIPOS_DOCUMENTALES]} · {(d.tamano / 1024).toFixed(0)} KB</span></div>
            <div className="fila">
              <span className={`etiqueta ${d.estadoAnalisis === 'COMPLETADO' ? 'ok' : d.estadoAnalisis === 'ERROR' ? 'critica' : ''}`}>{d.estadoAnalisis.toLowerCase().replace('_', ' ')}</span>
              <a className="boton secundario pequeno" href={`/api/documentos/${d.id}`} target="_blank" rel="noopener">Ver</a>
              {editable && iaDisponible && <BotonAccion accion={accionAnalizarDocumento.bind(null, id, d.id)} texto={d.estadoAnalisis === 'COMPLETADO' ? 'Analizar de nuevo' : 'Analizar con IA'} clase="pequeno" textoPendiente="Analizando…" />}
            </div>
          </div>
          {d.hechos ? <details><summary>Datos extraídos (con fuente y confianza)</summary><Hechos hechos={d.hechos as Record<string, unknown>} /></details> : null}
        </section>
      ))}
      <p><Link className="boton" href={`/expedientes/${id}/formulario`}>Continuar al formulario →</Link></p>
    </>
  );
}
