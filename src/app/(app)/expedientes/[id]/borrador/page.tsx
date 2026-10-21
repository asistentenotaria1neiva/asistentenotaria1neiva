import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { obtenerExpediente, puedeEditar, bloqueos } from '@/lib/servicios/expedientes';
import { leerCifrado } from '@/lib/almacenamiento';
import { accionGenerarBorrador } from '../../acciones';
import { BotonAccion } from '../../formularios';
import { fecha } from '../../../componentes';
import PizZip from 'pizzip';

/** Texto plano del .docx para la vista previa en pantalla */
function textoDocx(bytes: Buffer): string {
  const xml = new PizZip(bytes).file('word/document.xml')?.asText() ?? '';
  return xml.replace(/<w:tab\/>/g, ' ').replace(/<\/w:p>/g, '\n').replace(/<w:br[^>]*\/>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n');
}

export default async function Borrador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requerirSesion();
  const e = await obtenerExpediente(s, id);
  const [versiones, b] = await Promise.all([
    db.borrador.findMany({ where: { expedienteId: id }, orderBy: { version: 'desc' } }),
    bloqueos(id),
  ]);
  const ultimo = versiones[0];
  const previa = ultimo ? textoDocx(await leerCifrado(ultimo.rutaDocxCifrada)) : null;
  const desactualizado = ultimo && ultimo.creadoEn < e.actualizadoEn;
  return (
    <>
      <section className="tarjeta">
        <h2 style={{ marginTop: 0 }}>Borrador de la escritura</h2>
        <p className="suave">El borrador se arma reemplazando variables en las plantillas APROBADAS por el notario. La IA no redacta ni modifica el texto de las plantillas.</p>
        {b.criticas.length > 0 && <div className="aviso error">Hay {b.criticas.length} observación(es) crítica(s) abiertas: no se puede generar el borrador hasta corregirlas.</div>}
        {desactualizado && <div className="aviso alerta">Los datos cambiaron después del último borrador. Genérelo de nuevo antes de enviarlo a revisión.</div>}
        {puedeEditar(s, e) && <BotonAccion accion={accionGenerarBorrador.bind(null, id)} texto={ultimo ? 'Generar nueva versión' : 'Generar borrador'} textoPendiente="Generando…" />}
      </section>
      {versiones.length > 0 && (
        <section className="tarjeta">
          <h3 style={{ marginTop: 0 }}>Versiones</h3>
          <table>
            <thead><tr><th>Versión</th><th>Fecha</th><th>Plantillas usadas</th><th>Descargar</th></tr></thead>
            <tbody>{versiones.map((v) => (
              <tr key={v.id}>
                <td>v{v.version}</td>
                <td>{fecha(v.creadoEn)}</td>
                <td className="suave">{(v.plantillasUsadas as { tipoId: string; version: number }[]).map((p) => `${p.tipoId} v${p.version}`).join(', ')}</td>
                <td className="fila">
                  <a className="boton secundario pequeno" href={`/api/borradores/${v.id}?formato=docx`}>Word</a>
                  {v.rutaPdfCifrada && <a className="boton secundario pequeno" href={`/api/borradores/${v.id}?formato=pdf`} target="_blank" rel="noopener">PDF</a>}
                </td>
              </tr>
            ))}</tbody>
          </table>
          <p className="suave">Cada descarga queda registrada en la auditoría.</p>
        </section>
      )}
      {previa && (
        <section className="tarjeta">
          <h3 style={{ marginTop: 0 }}>Vista previa (versión {ultimo!.version})</h3>
          <div className="vista-previa">{previa}</div>
        </section>
      )}
    </>
  );
}
