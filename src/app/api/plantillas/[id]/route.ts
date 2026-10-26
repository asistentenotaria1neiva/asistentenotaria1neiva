/**
 * Una versión de plantilla en .docx (administrador y revisor, auditada):
 *   ?ejemplo=1 … llenada con datos FICTICIOS de prueba (para revisar el diseño ya diligenciado): los del
 *                caso de ejemplo del tipo y, si la versión viene de un caso real, los que propuso la IA al convertirlo
 *   ?vista=1 ... para el visor del panel (se muestra en pantalla en lugar de descargarse)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { leerSesion, datosAuditoria } from '@/lib/sesion';
import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { probarConEjemplo, valoresEjemploDe } from '@/lib/servicios/revision-plantillas';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await leerSesion();
  if (!s || !['ADMINISTRADOR', 'REVISOR'].includes(s.usuario.rol) || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return new NextResponse('No autorizado', { status: 401 });
  const { id } = await params;
  const ejemplo = request.nextUrl.searchParams.get('ejemplo') === '1';
  const vista = request.nextUrl.searchParams.get('vista') === '1';
  const p = await db.plantilla.findUnique({ where: { id } });
  if (!p) return new NextResponse('No encontrada', { status: 404 });

  let archivo: Buffer = Buffer.from(p.archivo);
  if (ejemplo) {
    const prueba = await probarConEjemplo(p.tipoId, archivo, valoresEjemploDe(p));
    if (!prueba) return new NextResponse('No hay datos de ejemplo para este tipo de escritura', { status: 404 });
    if ('error' in prueba) return new NextResponse(prueba.error, { status: 422 });
    archivo = prueba.docx;
  }
  await auditar({
    ...datosAuditoria(s), accion: vista ? 'PLANTILLA_VISUALIZADA' : 'PLANTILLA_DESCARGADA', entidad: 'plantilla', entidadId: id,
    detalle: { tipoId: p.tipoId, version: p.version, ejemplo },
  });
  const nombre = `${p.tipoId}-v${p.version}${ejemplo ? '-ejemplo' : ''}.docx`;
  return new NextResponse(new Uint8Array(archivo), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `${vista ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'Cache-Control': 'no-store',
    },
  });
}
