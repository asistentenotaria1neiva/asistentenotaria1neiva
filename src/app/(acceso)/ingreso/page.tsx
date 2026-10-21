import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { db } from '@/lib/db';
import { accionIngresar } from '../acciones';
import { FormularioIngreso } from '../componentes';

export default async function Ingreso({ searchParams }: { searchParams: Promise<{ instalado?: string }> }) {
  await connection(); // siempre en tiempo de petición (consulta la base de datos)
  if ((await db.usuario.count()) === 0) redirect('/instalacion');
  const { instalado } = await searchParams;
  return (
    <main className="acceso">
      <div className="tarjeta">
        <h1>Escrituración</h1>
        <p className="suave">Notaría Primera del Círculo de Neiva · uso exclusivo del personal autorizado.</p>
        {instalado && <div className="aviso exito">Administrador creado. Ingrese y configure el doble factor.</div>}
        <FormularioIngreso accion={accionIngresar} />
        <p className="suave" style={{ marginTop: '1rem' }}>¿Equipo nuevo? <Link href="/registrar-equipo">Registrar este equipo</Link></p>
      </div>
    </main>
  );
}
