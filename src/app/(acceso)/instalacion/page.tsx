import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { db } from '@/lib/db';
import { accionInstalar } from '../acciones';
import { FormularioInstalacion } from '../componentes';
import { MarcoAcceso } from '../Marco';

export const metadata = { title: 'Instalación' };

export default async function Instalacion() {
  await connection(); // siempre en tiempo de petición (consulta la base de datos)
  if ((await db.usuario.count()) > 0) redirect('/ingreso');
  return (
    <MarcoAcceso
      titulo="Instalación"
      descripcion="Cree la cuenta del primer administrador. Al ingresar se le pedirá configurar el doble factor."
      porQue={{ icono: 'candado', texto: 'Esta pantalla solo aparece mientras no exista ningún usuario y solo funciona desde la red de la oficina.' }}
    >
      <FormularioInstalacion accion={accionInstalar} />
    </MarcoAcceso>
  );
}
