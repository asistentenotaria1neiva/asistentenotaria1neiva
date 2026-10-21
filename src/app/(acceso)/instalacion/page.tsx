import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { db } from '@/lib/db';
import { accionInstalar } from '../acciones';
import { FormularioInstalacion } from '../componentes';

export default async function Instalacion() {
  await connection(); // siempre en tiempo de petición (consulta la base de datos)
  if ((await db.usuario.count()) > 0) redirect('/ingreso');
  return (
    <main className="acceso">
      <div className="tarjeta">
        <h1>Instalación</h1>
        <p className="suave">Cree la cuenta del primer administrador. Esta pantalla desaparece cuando existe un usuario y solo funciona desde la red de la oficina. Al ingresar se exigirá configurar el doble factor.</p>
        <FormularioInstalacion accion={accionInstalar} />
      </div>
    </main>
  );
}
