import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerirSesion } from '@/lib/sesion';
import { expedienteDePagina, puedeEditar, ErrorNegocio } from '@/lib/servicios/expedientes';
import { Buscador } from '../../../plantillas/Buscador';
import { FormularioAccion } from '../../formularios';
import { accionCambiarPlantilla } from '../../acciones';

export default async function CambiarPlantilla({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requerirSesion();
  const { id } = await params;
  let e: Awaited<ReturnType<typeof expedienteDePagina>>;
  try { e = await expedienteDePagina(s, id); } catch (err) { if (err instanceof ErrorNegocio) notFound(); throw err; }
  if (!puedeEditar(s, e)) notFound();
  const accion = accionCambiarPlantilla.bind(null, id);
  return (
    <>
      <div className="encabezado">
        <p><Link href={`/expedientes/${id}`}>← {e.numeroInterno}</Link></p>
        <h1>Cambiar la plantilla</h1>
        <p className="suave">Plantilla actual: <strong>{e.plantillaNombre}</strong>. Los documentos y las observaciones se conservan; las versiones ya generadas también.</p>
      </div>
      <details className="tarjeta">
        <summary><strong>Usar una plantilla personal</strong> (.docx)</summary>
        <div style={{ marginTop: 12 }}>
          <FormularioAccion accion={accion} texto="Usar mi plantilla" textoPendiente="Guardando…">
            <div className="campo">
              <label htmlFor="archivo">Plantilla personal (.docx)</label>
              <input id="archivo" name="archivo" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
            </div>
          </FormularioAccion>
        </div>
      </details>
      <Buscador s={s} parametros={await searchParams} base={`/expedientes/${id}/plantilla`} acciones={(p) => (
        <div className="acciones-plantilla">
          <FormularioAccion accion={accion} texto="Usar esta plantilla" textoPendiente="Guardando…" clase="exito">
            <input type="hidden" name="plantillaId" value={p.id} />
          </FormularioAccion>
        </div>
      )} />
    </>
  );
}
