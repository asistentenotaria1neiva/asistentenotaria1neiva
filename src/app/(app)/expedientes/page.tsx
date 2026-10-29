import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requerirSesion } from '@/lib/sesion';
import { TablaExpedientes, ESTADOS, INCLUIR_OTORGANTES } from '../componentes';

export default async function Expedientes({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  const s = await requerirSesion();
  const { q = '', estado = '' } = await searchParams;
  const texto = q.trim();
  // Por nombre, cada palabra por separado: «ilba triana» encuentra a ILBA PAOLA TRIANA FALLA
  const palabras = texto.split(/\s+/).filter(Boolean);
  const donde: Prisma.ExpedienteWhereInput = {
    ...(s.usuario.rol === 'DIGITADOR' ? { responsableId: s.usuario.id } : {}),
    ...(estado ? { estado: estado as Prisma.EnumEstadoExpedienteFilter['equals'] } : {}),
    ...(texto ? { OR: [
      { numeroInterno: { contains: texto, mode: 'insensitive' } },
      { comparecientes: { some: { AND: palabras.map((w) => ({ nombre: { contains: w, mode: 'insensitive' as const } })) } } },
      { comparecientes: { some: { numeroDocumento: { contains: texto, mode: 'insensitive' } } } },
      // Cédula escrita con puntos (36.068.591) contra la guardada sin ellos
      ...(/^[\d.,\s]+$/.test(texto) ? [{ comparecientes: { some: { numeroDocumento: { contains: texto.replace(/\D/g, '') } } } }] : []),
      // Nombres leídos de los documentos que aún no se confirman (se guardan en mayúsculas)
      { datosExtraidos: { some: { campo: { startsWith: 'persona:', endsWith: '.nombre' }, estado: { not: 'DESCARTADO' }, AND: palabras.map((w) => ({ valor: { string_contains: w.toUpperCase() } })) } } },
      { inmuebles: { some: { matricula: { contains: texto } } } },
    ] } : {}),
  };
  const filas = await db.expediente.findMany({ where: donde, include: { ...INCLUIR_OTORGANTES, tipo: { select: { nombre: true } }, responsable: { select: { nombreCompleto: true } }, _count: { select: { observaciones: { where: { estado: 'ABIERTA' } } } } }, orderBy: { actualizadoEn: 'desc' }, take: 200 });
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
