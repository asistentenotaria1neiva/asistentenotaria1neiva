import Link from 'next/link';
import { requerirSesion } from '@/lib/sesion';
import { listarExpedientes } from '@/lib/servicios/expedientes';
import { TablaExpedientes, Vacio } from '../componentes';
import { Icono } from '../../Icono';

export default async function Escrituras({ searchParams }: { searchParams: Promise<{ q?: string; eliminadas?: string }> }) {
  const s = await requerirSesion();
  const esAdmin = s.usuario.rol === 'ADMINISTRADOR';
  const { q = '', eliminadas: e = '' } = await searchParams;
  const eliminadas = e === 'solo' || e === 'excluir' ? e : 'incluir';
  const filas = await listarExpedientes(s, { q, limite: 200, eliminadas });
  const filtrado = !!q || eliminadas !== 'incluir';
  return (
    <>
      <div className="fila entre encabezado">
        <div>
          <h1>Escrituras</h1>
          <p className="suave">{s.usuario.rol !== 'ADMINISTRADOR' ? 'Las escrituras a su cargo.' : 'Todas las escrituras de la notaría.'}</p>
        </div>
        <Link className="boton" href="/expedientes/nuevo"><Icono nombre="mas" tamano={18} />Nueva escritura</Link>
      </div>
      <form className="tarjeta compacta filtros" method="get" role="search">
        <div className="ancho">
          <label htmlFor="q">Buscar</label>
          <div className="con-icono"><Icono nombre="buscar" tamano={18} /><input id="q" name="q" type="search" defaultValue={q} placeholder="Número, título, otorgantes o plantilla" /></div>
        </div>
        {esAdmin && (
          <div>
            <label htmlFor="eliminadas">Eliminadas por el usuario</label>
            <select id="eliminadas" name="eliminadas" defaultValue={eliminadas}>
              <option value="incluir">Mostrarlas (marcadas)</option>
              <option value="solo">Solo las eliminadas</option>
              <option value="excluir">Ocultarlas</option>
            </select>
          </div>
        )}
        <div className="acciones-filtro">
          <button type="submit">Buscar</button>
          {filtrado && <Link className="boton secundario" href="/expedientes">Limpiar</Link>}
        </div>
      </form>
      <p className="tenue" aria-live="polite">{filas.length === 200 ? 'Se muestran las 200 más recientes' : `${filas.length} escritura(s)`}{q ? ` con «${q}»` : ''}{eliminadas === 'solo' ? ' eliminadas por el usuario' : ''}.</p>
      <TablaExpedientes filas={filas} conResponsable={s.usuario.rol === 'ADMINISTRADOR'} vacio={
        eliminadas === 'solo' && !q ? <Vacio icono="papelera" titulo="Ninguna escritura eliminada"><p>Aquí aparecen las escrituras que los digitadores eliminaron de su lista.</p></Vacio>
          : filtrado ? <Vacio icono="buscar" titulo="Ninguna escritura coincide"><p>Pruebe con el número, una parte del título o el nombre de un otorgante.</p><Link className="boton secundario" href="/expedientes">Quitar la búsqueda</Link></Vacio>
          : <Vacio icono="escrituras" titulo="Aún no hay escrituras"><p>Las escrituras aparecen aquí en cuanto se crean.</p><Link className="boton" href="/expedientes/nuevo"><Icono nombre="mas" tamano={18} />Nueva escritura</Link></Vacio>
      } />
    </>
  );
}
