import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { TablaExpedientes, ESTADOS } from '../componentes';

export default async function Expedientes({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  const s = await requerirSesion();
  const { q = '', estado = '' } = await searchParams;
  const donde: Prisma.ExpedienteWhereInput = {
    ...(s.usuario.rol === 'DIGITADOR' ? { responsableId: s.usuario.id } : {}),
    ...(estado ? { estado: estado as Prisma.EnumEstadoExpedienteFilter['equals'] } : {}),
    ...(q.trim() ? { OR: [
      { numeroInterno: { contains: q.trim(), mode: 'insensitive' } },
      { comparecientes: { some: { OR: [{ nombre: { contains: q.trim(), mode: 'insensitive' } }, { numeroDocumento: { contains: q.trim() } }] } } },
      { inmuebles: { some: { matricula: { contains: q.trim() } } } },
    ] } : {}),
  };
  const filas = await db.expediente.findMany({ where: donde, include: { tipo: { select: { nombre: true } }, responsable: { select: { nombreCompleto: true } }, _count: { select: { observaciones: { where: { estado: 'ABIERTA' } } } } }, orderBy: { actualizadoEn: 'desc' }, take: 200 });
  return (
    <>
      <div className="fila entre encabezado">
        <h1>Expedientes</h1>
        <Link className="boton" href="/expedientes/nuevo">+ Nuevo expediente</Link>
      </div>
      <form className="tarjeta filtros" method="get" role="search">
        <div className="ancho"><label htmlFor="q">Buscar</label><input id="q" name="q" type="search" defaultValue={q} placeholder="Número, nombre, documento o matrícula" /></div>
        <div><label htmlFor="estado">Estado</label>
          <select id="estado" name="estado" defaultValue={estado}><option value="">Todos</option>{Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}</select></div>
        <div className="acciones-filtro">
          <button type="submit">Filtrar</button>
          {(q || estado) && <Link className="boton secundario" href="/expedientes">Limpiar</Link>}
        </div>
      </form>
      <p className="suave">{filas.length === 200 ? 'Se muestran los 200 más recientes' : `${filas.length} expediente(s)`}{q || estado ? ' con el filtro aplicado' : ''}. No existe exportación masiva de datos.</p>
      <TablaExpedientes filas={filas} />
    </>
  );
}
