import { requerirSesion } from '@/lib/sesion';
import { opcionesFiltro, puedeAdministrar } from '@/lib/servicios/plantillas';
import { Buscador } from './Buscador';
import { CargaPlantillas } from './CargaPlantillas';
import { BotonAccion, FormularioAccion } from '../expedientes/formularios';
import { accionEditarPlantilla, accionActivarPlantilla, accionEliminarPlantilla } from './acciones';
import { Icono } from '../../Icono';

const fechaCampo = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

export const metadata = { title: 'Biblioteca de plantillas' };

export default async function Biblioteca({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requerirSesion();
  const parametros = await searchParams;
  const admin = puedeAdministrar(s);
  const opciones = admin ? await opcionesFiltro() : null;
  return (
    <>
      <div className="encabezado">
        <h1>Biblioteca de plantillas</h1>
        <p className="suave">Las escrituras modelo de la notaría, por categoría y fecha. {admin ? 'Como revisor puede agregar plantillas, corregir sus datos o retirarlas.' : 'Elija una para verla; para usarla, empiece una «Nueva escritura».'}</p>
      </div>
      {opciones && (
        <details className="tarjeta carga-nueva">
          <summary><Icono nombre="subir" tamano={18} />Agregar plantillas a la biblioteca</summary>
          <CargaPlantillas categorias={opciones.categorias.map((c) => c.nombre)} subcategorias={[...new Set(opciones.categorias.flatMap((c) => c.subcategorias.map((x) => x.nombre)))].sort()} />
        </details>
      )}
      <Buscador s={s} parametros={parametros} base="/plantillas" administrar={admin} acciones={admin ? (p) => (
        <details className="edicion-plantilla">
          <summary><Icono nombre="editar" tamano={16} />Editar datos, retirar o eliminar</summary>
          <FormularioAccion accion={accionEditarPlantilla.bind(null, p.id)} texto="Guardar cambios" textoPendiente="Guardando…" clase="pequeno">
            <div className="campos-columnas">
              <div className="campo"><label htmlFor="e-nombre">Nombre</label><input id="e-nombre" name="nombre" type="text" defaultValue={p.nombre} maxLength={200} /></div>
              <div className="campo"><label htmlFor="e-categoria">Categoría</label><input id="e-categoria" name="categoria" type="text" defaultValue={p.categoria} list="categorias-biblioteca" required maxLength={80} /></div>
              <div className="campo"><label htmlFor="e-sub">Banco / subcategoría</label><input id="e-sub" name="subcategoria" type="text" defaultValue={p.subcategoria ?? ''} maxLength={80} /></div>
              <div className="campo"><label htmlFor="e-fecha">Fecha</label><input id="e-fecha" name="fecha" type="date" defaultValue={fechaCampo(p.fecha)} /></div>
            </div>
          </FormularioAccion>
          <div className="acciones-edicion">
            <BotonAccion accion={accionActivarPlantilla.bind(null, p.id, !p.activa)} texto={p.activa ? 'Retirar de la biblioteca' : 'Volver a publicar'} icono={p.activa ? 'ojo' : 'check'} clase="secundario pequeno"
              confirmar={p.activa ? `¿Retirar «${p.nombre}»? Deja de aparecer para los digitadores, pero no se borra: puede volver a publicarla.` : undefined} />
            <BotonAccion accion={accionEliminarPlantilla.bind(null, p.id)} texto="Eliminar" icono="papelera" clase="peligro-suave pequeno" confirmar={`¿Eliminar «${p.nombre}» de la biblioteca? Se borra el archivo. No se puede deshacer.`} />
          </div>
        </details>
      ) : undefined} />
    </>
  );
}
