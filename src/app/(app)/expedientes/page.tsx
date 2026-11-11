import Link from 'next/link';
import { requerirSesion } from '@/lib/sesion';
import { listarExpedientes } from '@/lib/servicios/expedientes';
import { TablaExpedientes } from '../componentes';

export default async function Escrituras({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requerirSesion();
  const { q = '' } = await searchParams;
  const filas = await listarExpedientes(s, { q, limite: 200 });
  return (
    <>
      <div className="fila entre encabezado">
        <h1>Escrituras</h1>
        <Link className="boton" href="/expedientes/nuevo">Nueva escritura</Link>
      </div>
      <form className="tarjeta filtros" method="get" role="search">
        <div className="ancho"><label htmlFor="q">Buscar</label><input id="q" name="q" type="search" defaultValue={q} placeholder="Número, título, otorgantes o plantilla" /></div>
        <div className="acciones-filtro">
          <button type="submit">Buscar</button>
          {q && <Link className="boton secundario" href="/expedientes">Limpiar</Link>}
        </div>
      </form>
      <p className="suave">{filas.length === 200 ? 'Se muestran las 200 más recientes' : `${filas.length} escritura(s)`}{q ? ' con el filtro aplicado' : ''}.{s.usuario.rol === 'DIGITADOR' ? ' Solo ve las suyas.' : ''}</p>
      <TablaExpedientes filas={filas} conResponsable={s.usuario.rol !== 'DIGITADOR'} />
    </>
  );
}
