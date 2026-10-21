/** Descarga de una versión de plantilla para revisión (solo administrador, auditada) */
import { NextResponse } from 'next/server';
import { leerSesion, datosAuditoria } from '@/lib/sesion';
import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await leerSesion();
  if (!s || s.usuario.rol !== 'ADMINISTRADOR' || !s.segundoFactorOk) return new NextResponse('No autorizado', { status: 401 });
  const { id } = await params;
  const p = await db.plantilla.findUnique({ where: { id } });
  if (!p) return new NextResponse('No encontrada', { status: 404 });
  await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_DESCARGADA', entidad: 'plantilla', entidadId: id });
  return new NextResponse(new Uint8Array(p.archivo), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${p.tipoId}-v${p.version}.docx`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
