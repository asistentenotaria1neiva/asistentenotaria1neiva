'use client';
/** Filtros del panel de plantillas: los selectores se aplican al cambiar; la búsqueda, con Enter o el botón */
import Form from 'next/form';
import Link from 'next/link';

export interface ValoresFiltro { q: string; estado: string; categoria: string; prioridad: string; ia: string; orden: string }
type Opciones = [string, string][];

export function FiltrosPlantillas({ valores, categorias, activos }: { valores: ValoresFiltro; categorias: Opciones; activos: boolean }) {
  const selector = (nombre: keyof ValoresFiltro, etiqueta: string, opciones: Opciones) => (
    <div>
      <label htmlFor={`f-${nombre}`}>{etiqueta}</label>
      <select id={`f-${nombre}`} name={nombre} defaultValue={valores[nombre]} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {opciones.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </div>
  );
  return (
    // key: al limpiar o cambiar de pestaña los campos toman los valores nuevos de la URL
    <Form key={JSON.stringify(valores)} action="/plantillas" className="tarjeta filtros compactos" role="search">
      {valores.estado && <input type="hidden" name="estado" value={valores.estado} />}
      <div className="ancho">
        <label htmlFor="f-q">Buscar</label>
        <input id="f-q" name="q" type="search" defaultValue={valores.q} placeholder="Nombre, categoría o descripción (p. ej. hipoteca)" />
      </div>
      {selector('categoria', 'Categoría', [['', 'Todas'], ...categorias])}
      {selector('prioridad', 'Prioridad', [['', 'Todas'], ['Alta', 'Alta'], ['Media', 'Media'], ['Baja', 'Baja']])}
      {selector('ia', 'Revisión de la IA', [['', 'Cualquiera'], ['apta', 'Apta'], ['observaciones', 'Con observaciones'], ['no_apta', 'No apta'], ['sin_revisar', 'Sin revisar']])}
      {selector('orden', 'Ordenar por', [['', 'Categoría'], ['nombre', 'Nombre (A–Z)'], ['reciente', 'Última carga'], ['prioridad', 'Prioridad']])}
      <div className="acciones-filtro">
        <button type="submit">Buscar</button>
        {activos && <Link className="boton secundario" href={valores.estado ? `/plantillas?estado=${valores.estado}` : '/plantillas'}>Limpiar</Link>}
      </div>
    </Form>
  );
}
