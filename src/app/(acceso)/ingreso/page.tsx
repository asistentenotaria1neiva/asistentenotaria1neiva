import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { db } from '@/lib/db';
import { accionIngresar } from '../acciones';
import { FormularioIngreso } from '../componentes';
import { MarcoAcceso } from '../Marco';
import { Icono } from '../../Icono';

export const metadata = { title: 'Ingresar' };

export default async function Ingreso({ searchParams }: { searchParams: Promise<{ instalado?: string }> }) {
  await connection(); // siempre en tiempo de petición (consulta la base de datos)
  if ((await db.usuario.count()) === 0) redirect('/instalacion');
  const { instalado } = await searchParams;
  return (
    <MarcoAcceso
      titulo="Ingresar"
      descripcion="Escriba el usuario y la contraseña que le asignó el administrador."
      paso={1}
      porQue={{ icono: 'red', texto: 'Por seguridad, solo se ingresa desde la red y los equipos aprobados de la notaría. Varios intentos fallidos bloquean la cuenta por un tiempo.' }}
      pie={<>¿Este computador es nuevo? <Link href="/registrar-equipo">Registrar este equipo</Link></>}
    >
      {instalado && <div className="aviso exito" role="status"><Icono nombre="exito" /><div>Administrador creado. Ingrese y configure el doble factor.</div></div>}
      <FormularioIngreso accion={accionIngresar} />
    </MarcoAcceso>
  );
}
