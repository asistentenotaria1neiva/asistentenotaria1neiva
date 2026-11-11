import { requerirSesion } from '@/lib/sesion';
import { opcionesFiltro, puedeAdministrar } from '@/lib/servicios/plantillas';
import { Buscador } from './Buscador';
import { CargaPlantillas } from './CargaPlantillas';
import { BotonAccion, FormularioAccion } from '../expedientes/formularios';
import { accionEditarPlantilla, accionActivarPlantilla, accionEliminarPlantilla } from './acciones';

const fechaCampo = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

export default async function Biblioteca({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requerirSesion();
  const parametros = await searchParams;
  const admin = puedeAdministrar(s);
  const opciones = admin ? await opcionesFiltro() : null;
  return (
    <>
      <div className="encabezado">
        <h1>Biblioteca de plantillas</h1>
        <p className="suave">Escrituras modelo de la notaría por categoría y fecha. Elija una para verla{admin ? '; como revisor puede agregar plantillas, corregir sus datos o retirarlas.' : ' y úsela desde «Nueva escritura».'}</p>
      </div>
      {opciones && (
        <details className="tarjeta">
          <summary><strong>Agregar plantillas a la biblioteca</strong></summary>
          <div style={{ marginTop: 12 }}>
            <CargaPlantillas categorias={opciones.categorias.map((c) => c.nombre)} subcategorias={[...new Set(opciones.categorias.flatMap((c) => c.subcategorias.map((x) => x.nombre)))].sort()} />
          </div>
        </details>
      )}
      <Buscador s={s} parametros={parametros} base="/plantillas" administrar={admin} acciones={admin ? (p) => (
        <details className="acciones-plantilla">
          <summary>Editar datos, retirar o eliminar</summary>
          <FormularioAccion accion={accionEditarPlantilla.bind(null, p.id)} texto="Guardar" textoPendiente="Guardando…" clase="pequeno">
            <div className="campos-columnas">
              <div className="campo"><label htmlFor="e-nombre">Nombre</label><input id="e-nombre" name="nombre" type="text" defaultValue={p.nombre} maxLength={200} /></div>
              <div className="campo"><label htmlFor="e-categoria">Categoría</label><input id="e-categoria" name="categoria" type="text" defaultValue={p.categoria} list="categorias-biblioteca" required maxLength={80} /></div>
              <div className="campo"><label htmlFor="e-sub">Banco / subcategoría</label><input id="e-sub" name="subcategoria" type="text" defaultValue={p.subcategoria ?? ''} maxLength={80} /></div>
              <div className="campo"><label htmlFor="e-fecha">Fecha</label><input id="e-fecha" name="fecha" type="date" defaultValue={fechaCampo(p.fecha)} /></div>
            </div>
          </FormularioAccion>
          <div className="fila" style={{ marginTop: 8 }}>
            <BotonAccion accion={accionActivarPlantilla.bind(null, p.id, !p.activa)} texto={p.activa ? 'Retirar de la biblioteca' : 'Volver a publicar'} clase="secundario pequeno" />
            <BotonAccion accion={accionEliminarPlantilla.bind(null, p.id)} texto="Eliminar" clase="peligro pequeno" confirmar={`¿Eliminar «${p.nombre}» de la biblioteca? No se puede deshacer.`} />
          </div>
        </details>
      ) : undefined} />
    </>
  );
}
