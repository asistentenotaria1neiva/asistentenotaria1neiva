/**
 * Escritura de una revisión en .docx (autenticada; la descarga queda en la auditoría):
 *   ?archivo=corregida ... la copia con los cambios aplicados (por defecto, el original)
 *   ?vista=1 ............. para el visor de la página (se muestra en pantalla en lugar de descargarse)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { leerSesion } from '@/lib/sesion';
import { descargarRevision } from '@/lib/servicios/revision-escrituras';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await leerSesion();
  if (!s || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return new NextResponse('No autorizado', { status: 401 });
  const cual = req.nextUrl.searchParams.get('archivo') === 'corregida' ? 'corregida' : 'original';
  const vista = req.nextUrl.searchParams.get('vista') === '1';
  try {
    const { id } = await params;
    const d = await descargarRevision(s, id, cual, vista);
    return new NextResponse(new Uint8Array(d.bytes), {
      headers: {
        'Content-Type': d.mime,
        'Content-Disposition': `${vista ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.nombre)}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('No encontrado', { status: 404 });
  }
}
