/**
 * Una plantilla de la biblioteca en .docx (cualquier usuario con sesión; la descarga se audita).
 *   ?vista=1 ... para la vista previa (se muestra en pantalla en lugar de descargarse)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { leerSesion, datosAuditoria } from '@/lib/sesion';
import { auditar } from '@/lib/auditoria';
import { obtenerPlantilla, archivoPlantilla } from '@/lib/servicios/plantillas';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await leerSesion();
  if (!s || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return new NextResponse('No autorizado', { status: 401 });
  const { id } = await params;
  const vista = request.nextUrl.searchParams.get('vista') === '1';
  const p = await obtenerPlantilla(id);
  if (!p || (!p.activa && s.usuario.rol === 'DIGITADOR')) return new NextResponse('No encontrada', { status: 404 });
  try {
    const archivo = await archivoPlantilla(id);
    if (!vista) await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_DESCARGADA', entidad: 'plantilla', entidadId: id, detalle: { nombre: p.nombre } });
    return new NextResponse(new Uint8Array(archivo), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `${vista ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(p.nombreArchivo)}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    console.error('[api/plantillas]', e);
    return new NextResponse('No se pudo leer la plantilla', { status: 500 });
  }
}
