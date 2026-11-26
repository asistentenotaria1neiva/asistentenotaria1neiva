/**
 * Estado liviano de una escritura con procesos en segundo plano (RefrescoAutomatico en
 * src/app/(app)/expedientes/formularios.tsx): responde solo una huella corta, y la página se vuelve a
 * pedir completa únicamente cuando la huella cambia. Hace la misma vigilancia que la página
 * (reanudar la generación cortada, leer documentos trabados), que sigue corriendo después de responder.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { leerSesion } from '@/lib/sesion';
import { obtenerExpediente, puedeEditar } from '@/lib/servicios/expedientes';
import { vigilarExpediente, huellaEstado } from '@/lib/servicios/vigilancia';

/** Una etapa reanudada o una lectura corre en esta invocación */
export const maxDuration = 300;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await leerSesion();
  if (!s || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { id } = await params;
  let e: Awaited<ReturnType<typeof obtenerExpediente>>;
  try { e = await obtenerExpediente(s, id); } catch { return NextResponse.json({ error: 'No encontrado' }, { status: 404 }); }
  const { enCurso, documentos } = await vigilarExpediente(s, id, puedeEditar(s, e));
  const ultima = await db.generacion.findFirst({ where: { expedienteId: id }, orderBy: { version: 'desc' }, select: { id: true, estado: true } });
  return NextResponse.json({ huella: huellaEstado(enCurso, documentos, ultima ?? undefined) }, { headers: { 'Cache-Control': 'no-store' } });
}
