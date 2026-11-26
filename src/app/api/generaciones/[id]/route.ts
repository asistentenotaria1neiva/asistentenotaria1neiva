/**
 * Una versión generada de la escritura en Word (autenticada; la descarga se audita).
 *   ?vista=1 ... para el visor de la página (se muestra en pantalla en lugar de descargarse)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { leerSesion } from '@/lib/sesion';
import { descargarGeneracion } from '@/lib/servicios/generacion';

/**
 * Copia solo para esta persona (private), validada cada vez (no-cache): si la versión no cambió se
 * responde 304 sin el archivo, así el visor no vuelve a bajar el Word cada vez que se abre la página.
 */
const CACHE = 'private, no-cache';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await leerSesion();
  if (!s || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return new NextResponse('No autorizado', { status: 401 });
  const vista = req.nextUrl.searchParams.get('vista') === '1';
  try {
    const { id } = await params;
    const g = await descargarGeneracion(s, id, vista, req.headers.get('if-none-match'));
    const validacion: Record<string, string> = g.etag ? { 'Cache-Control': CACHE, ETag: g.etag } : { 'Cache-Control': 'no-store' };
    if (!g.bytes) return new NextResponse(null, { status: 304, headers: validacion });
    return new NextResponse(new Uint8Array(g.bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `${vista ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(g.nombre)}`,
        ...validacion,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('No encontrado', { status: 404 });
  }
}
