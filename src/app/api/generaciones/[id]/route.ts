/**
 * Una versión generada de la escritura en Word (autenticada; la descarga se audita).
 *   ?vista=1 ... para el visor de la página (se muestra en pantalla en lugar de descargarse)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { leerSesion } from '@/lib/sesion';
import { descargarGeneracion } from '@/lib/servicios/generacion';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await leerSesion();
  if (!s || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return new NextResponse('No autorizado', { status: 401 });
  const vista = req.nextUrl.searchParams.get('vista') === '1';
  try {
    const { id } = await params;
    const g = await descargarGeneracion(s, id, vista);
    return new NextResponse(new Uint8Array(g.bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `${vista ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(g.nombre)}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('No encontrado', { status: 404 });
  }
}
