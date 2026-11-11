import { requerirSesion } from '@/lib/sesion';
import { Buscador } from '../../plantillas/Buscador';
import { FormularioAccion } from '../formularios';
import { accionCrearExpediente } from '../acciones';

const CampoTitulo = () => (
  <div className="campo">
    <label htmlFor="titulo">Título de la escritura (opcional)</label>
    <input id="titulo" name="titulo" type="text" maxLength={200} placeholder="p. ej. Compraventa casa Las Granjas – Pérez a Gómez" />
  </div>
);

export default async function NuevaEscritura({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requerirSesion();
  const parametros = await searchParams;
  return (
    <>
      <div className="encabezado">
        <h1>Nueva escritura</h1>
        <p className="suave">Busque la plantilla que necesita, revísela en la vista previa y úsela. Después cargará los documentos y escribirá sus observaciones; la IA adapta la plantilla con esos datos, sin cambiar su estructura.</p>
      </div>
      <details className="tarjeta">
        <summary><strong>¿Tiene su propia plantilla?</strong> Cárguela en Word (.docx)</summary>
        <div style={{ marginTop: 12 }}>
          <FormularioAccion accion={accionCrearExpediente} texto="Crear con mi plantilla" textoPendiente="Creando…">
            <div className="campo">
              <label htmlFor="archivo">Plantilla personal (.docx)</label>
              <input id="archivo" name="archivo" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
              <div className="ayuda">Una escritura modelo completa. Queda solo en esta escritura (no se agrega a la biblioteca).</div>
            </div>
            <CampoTitulo />
          </FormularioAccion>
        </div>
      </details>
      <Buscador s={s} parametros={parametros} base="/expedientes/nuevo" acciones={(p) => (
        <div className="acciones-plantilla">
          <FormularioAccion accion={accionCrearExpediente} texto="Usar esta plantilla" textoPendiente="Creando…" clase="exito">
            <input type="hidden" name="plantillaId" value={p.id} />
            <CampoTitulo />
          </FormularioAccion>
        </div>
      )} />
    </>
  );
}
