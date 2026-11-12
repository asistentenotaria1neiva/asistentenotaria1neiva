import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerirSesion } from '@/lib/sesion';
import { expedienteDePagina, puedeEditar, ErrorNegocio } from '@/lib/servicios/expedientes';
import { Buscador } from '../../../plantillas/Buscador';
import { FormularioAccion } from '../../formularios';
import { accionCambiarPlantilla } from '../../acciones';
import { Icono } from '../../../../Icono';

export const metadata = { title: 'Cambiar la plantilla' };

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
        <Link className="migas" href={`/expedientes/${id}`}><Icono nombre="atras" tamano={16} /><span className="radicado">{e.numeroInterno}</span></Link>
        <h1>Cambiar la plantilla</h1>
        <p className="suave">Plantilla actual: <strong>{e.plantillaNombre}</strong>. Los documentos, las observaciones y las versiones ya generadas se conservan.</p>
      </div>
      <Buscador s={s} parametros={await searchParams} base={`/expedientes/${id}/plantilla`} acciones={(p) => (
        <div className="acciones-plantilla">
          <FormularioAccion accion={accion} texto="Usar esta plantilla" textoPendiente="Guardando…" icono="check">
            <input type="hidden" name="plantillaId" value={p.id} />
          </FormularioAccion>
        </div>
      )} />
      <details className="tarjeta plantilla-propia mt">
        <summary>Usar una plantilla personal (.docx)</summary>
        <div className="contenido">
          <FormularioAccion accion={accion} texto="Usar mi plantilla" textoPendiente="Guardando…" clase="secundario" icono="subir">
            <div className="campo">
              <label htmlFor="archivo">Plantilla personal (.docx)</label>
              <input id="archivo" name="archivo" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
            </div>
          </FormularioAccion>
        </div>
      </details>
    </>
  );
}
