import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { obtenerExpediente, puedeEditar, bloqueos } from '@/lib/servicios/expedientes';
import { accionGenerarBorrador } from '../../acciones';
import { BotonAccion } from '../../formularios';
import { Tabla, fecha } from '../../../componentes';
import { VisorDocx } from '../../../plantillas/VisorDocx';

export default async function Borrador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requerirSesion();
  const e = await obtenerExpediente(s, id);
  const [versiones, b] = await Promise.all([
    db.borrador.findMany({ where: { expedienteId: id }, orderBy: { version: 'desc' } }),
    bloqueos(id),
  ]);
  const ultimo = versiones[0];
  const desactualizado = ultimo && ultimo.creadoEn < e.actualizadoEn;
  return (
    <>
      <section className="tarjeta">
        <h2>Borrador de la escritura</h2>
        <p className="suave">El borrador se arma reemplazando variables en las plantillas APROBADAS por el notario. La IA no redacta ni modifica el texto de las plantillas.</p>
        {b.criticas.length > 0 && <div className="aviso error">Hay {b.criticas.length} observación(es) crítica(s) abiertas: no se puede generar el borrador hasta corregirlas.</div>}
        {desactualizado && <div className="aviso alerta">Los datos cambiaron después del último borrador. Genérelo de nuevo antes de enviarlo a revisión.</div>}
        {puedeEditar(s, e) && <BotonAccion accion={accionGenerarBorrador.bind(null, id)} texto={ultimo ? 'Generar nueva versión' : 'Generar borrador'} textoPendiente="Generando…" />}
      </section>
      {versiones.length > 0 && (
        <section className="tarjeta">
          <h3 style={{ marginTop: 0 }}>Versiones</h3>
          <Tabla>
            <thead><tr><th>Versión</th><th>Fecha</th><th>Plantillas usadas</th><th>Descargar</th></tr></thead>
            <tbody>{versiones.map((v) => (
              <tr key={v.id}>
                <td className="principal-celda"><strong>v{v.version}</strong>{v.id === ultimo?.id && <> <span className="etiqueta informativa">última</span></>}</td>
                <td data-etiqueta="Fecha">{fecha(v.creadoEn)}</td>
                <td data-etiqueta="Plantillas" className="suave">{(v.plantillasUsadas as { tipoId: string; version: number }[]).map((p) => `${p.tipoId} v${p.version}`).join(', ')}</td>
                <td data-etiqueta="Descargar">
                  <div className="fila" style={{ gap: '0.4rem' }}>
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
