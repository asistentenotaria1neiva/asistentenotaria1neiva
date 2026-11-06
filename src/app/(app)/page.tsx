import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { TablaExpedientes, INCLUIR_OTORGANTES } from './componentes';

const incluir = { ...INCLUIR_OTORGANTES, tipo: { select: { nombre: true } }, responsable: { select: { nombreCompleto: true } }, _count: { select: { observaciones: { where: { estado: 'ABIERTA' as const } } } } };

export default async function Inicio({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await requerirSesion();
  const { error } = await searchParams;
  const expedientes = await db.expediente.findMany({ where: { responsableId: s.usuario.id }, include: incluir, orderBy: { actualizadoEn: 'desc' }, take: 100 });
  return (
    <>
      <div className="fila entre encabezado">
        <h1>Mis expedientes</h1>
        <Link className="boton" href="/expedientes/nuevo">Nuevo expediente</Link>
      </div>
      {error === 'permiso' && <div className="aviso error">No tiene permiso para esa sección.</div>}
      <section className="tarjeta"><TablaExpedientes filas={expedientes} /></section>
    </>
  );
}
