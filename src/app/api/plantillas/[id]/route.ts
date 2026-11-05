/**
 * Una versión de plantilla en .docx (administrador y revisor, auditada):
 *   ?vista=1 ... para el visor del panel (se muestra en pantalla en lugar de descargarse)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { leerSesion, datosAuditoria } from '@/lib/sesion';
import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await leerSesion();
  if (!s || !['ADMINISTRADOR', 'REVISOR'].includes(s.usuario.rol) || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return new NextResponse('No autorizado', { status: 401 });
  const { id } = await params;
  const vista = request.nextUrl.searchParams.get('vista') === '1';
  const p = await db.plantilla.findUnique({ where: { id } });
  if (!p) return new NextResponse('No encontrada', { status: 404 });

  const archivo = Buffer.from(p.archivo);
  await auditar({
    ...datosAuditoria(s), accion: vista ? 'PLANTILLA_VISUALIZADA' : 'PLANTILLA_DESCARGADA', entidad: 'plantilla', entidadId: id,
    detalle: { tipoId: p.tipoId, version: p.version },
  });
  const nombre = `${p.tipoId}-v${p.version}.docx`;
  return new NextResponse(new Uint8Array(archivo), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `${vista ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'Cache-Control': 'no-store',
    },
  });
}
