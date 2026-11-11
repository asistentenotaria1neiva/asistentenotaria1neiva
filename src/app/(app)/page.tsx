import Link from 'next/link';
import { requerirSesion } from '@/lib/sesion';
import { listarExpedientes } from '@/lib/servicios/expedientes';
import { TablaExpedientes } from './componentes';

export default async function Inicio({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await requerirSesion();
  const { error } = await searchParams;
  const filas = await listarExpedientes(s, { soloPropios: true, limite: 50 });
  return (
    <>
      <div className="fila entre encabezado">
        <h1>Mis escrituras</h1>
        <div className="fila">
          <Link className="boton secundario" href="/plantillas">Biblioteca de plantillas</Link>
          <Link className="boton" href="/expedientes/nuevo">Nueva escritura</Link>
        </div>
      </div>
      {error === 'permiso' && <div className="aviso error">No tiene permiso para esa sección.</div>}
      <section className="tarjeta"><TablaExpedientes filas={filas} conResponsable={false} /></section>
    </>
  );
}
