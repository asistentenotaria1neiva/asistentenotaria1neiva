import Link from 'next/link';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { TablaExpedientes } from './componentes';

const incluir = { tipo: { select: { nombre: true } }, responsable: { select: { nombreCompleto: true } }, _count: { select: { observaciones: { where: { estado: 'ABIERTA' as const } } } } };

export default async function Inicio({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await requerirSesion();
  const { error } = await searchParams;
  const rol = s.usuario.rol;
  const [mios, enRevision, devueltos] = await Promise.all([
    db.expediente.findMany({ where: { responsableId: s.usuario.id, estado: { in: ['BORRADOR', 'DEVUELTO', 'EN_REVISION'] } }, include: incluir, orderBy: { actualizadoEn: 'desc' }, take: 50 }),
    rol !== 'DIGITADOR' ? db.expediente.findMany({ where: { estado: 'EN_REVISION' }, include: incluir, orderBy: { enviadoRevisionEn: 'asc' }, take: 50 }) : Promise.resolve([]),
    db.expediente.count({ where: { responsableId: s.usuario.id, estado: 'DEVUELTO' } }),
  ]);
  const alertas = rol === 'ADMINISTRADOR' ? await db.alerta.count({ where: { atendida: false } }) : 0;
  const equiposPendientes = rol === 'ADMINISTRADOR' ? await db.dispositivo.count({ where: { estado: 'PENDIENTE' } }) : 0;
  return (
    <>
      <div className="fila entre"><h1>Inicio</h1><Link className="boton" href="/expedientes/nuevo">Nuevo expediente</Link></div>
      {error === 'permiso' && <div className="aviso error">No tiene permiso para esa sección.</div>}
      {devueltos > 0 && <div className="aviso alerta">Tiene {devueltos} expediente(s) devuelto(s) por el revisor.</div>}
      {alertas > 0 && <div className="aviso alerta">Hay {alertas} alerta(s) de seguridad sin atender. <Link href="/admin/alertas">Ver alertas</Link></div>}
      {equiposPendientes > 0 && <div className="aviso info">Hay {equiposPendientes} equipo(s) pendiente(s) de aprobación. <Link href="/admin/dispositivos">Revisar</Link></div>}
      {rol !== 'DIGITADOR' && (
        <section className="tarjeta"><h2 style={{ marginTop: 0 }}>Pendientes de revisión</h2><TablaExpedientes filas={enRevision} /></section>
      )}
      <section className="tarjeta"><h2 style={{ marginTop: 0 }}>Mis expedientes en curso</h2><TablaExpedientes filas={mios} /></section>
      <p className="suave">La aplicación prepara, verifica y advierte. La firma, el control de legalidad y la responsabilidad son del notario.</p>
    </>
  );
}
