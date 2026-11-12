import { requerirSesion } from '@/lib/sesion';
import { Buscador } from '../../plantillas/Buscador';
import { FormularioAccion } from '../formularios';
import { accionCrearExpediente } from '../acciones';

const CampoTitulo = ({ id }: { id: string }) => (
  <div className="campo">
    <label htmlFor={id}>Título de la escritura <span className="opcional">(opcional)</span></label>
    <input id={id} name="titulo" type="text" maxLength={200} placeholder="p. ej. Compraventa casa Las Granjas – Pérez a Gómez" />
  </div>
);

export const metadata = { title: 'Nueva escritura' };

export default async function NuevaEscritura({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requerirSesion();
  const parametros = await searchParams;
  return (
    <>
      <div className="encabezado">
        <p className="sobretitulo"><span className="tres-lineas" aria-hidden="true" />Paso 1 de 5 · Plantilla</p>
        <h1>Nueva escritura</h1>
        <p className="suave">Elija la escritura modelo más parecida al negocio (mismo acto, banco, tipo de inmueble y estado civil), revísela y úsela. Después cargará los documentos; la IA adapta la plantilla con sus datos sin cambiar su estructura.</p>
      </div>
      <Buscador s={s} parametros={parametros} base="/expedientes/nuevo" acciones={(p) => (
        <div className="acciones-plantilla">
          <FormularioAccion accion={accionCrearExpediente} texto="Usar esta plantilla" textoPendiente="Creando…" icono="check">
            <input type="hidden" name="plantillaId" value={p.id} />
            <CampoTitulo id="titulo-biblioteca" />
          </FormularioAccion>
        </div>
      )} />
      <details className="tarjeta plantilla-propia mt">
        <summary>¿Tiene su propia plantilla? Cárguela en Word (.docx)</summary>
        <div className="contenido">
          <FormularioAccion accion={accionCrearExpediente} texto="Crear con mi plantilla" textoPendiente="Creando…" clase="secundario" icono="subir">
            <div className="campos-columnas">
              <div className="campo">
                <label htmlFor="archivo">Plantilla personal (.docx)</label>
                <input id="archivo" name="archivo" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
                <div className="ayuda">Una escritura modelo completa. Queda solo en esta escritura; no se agrega a la biblioteca.</div>
              </div>
              <CampoTitulo id="titulo-propia" />
            </div>
          </FormularioAccion>
        </div>
      </details>
    </>
  );
}
