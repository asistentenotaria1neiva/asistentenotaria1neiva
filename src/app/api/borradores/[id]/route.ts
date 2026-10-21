/** Descarga individual de un borrador en Word o PDF (autenticada y auditada) */
import { NextResponse, type NextRequest } from 'next/server';
import { leerSesion } from '@/lib/sesion';
import { descargarBorrador } from '@/lib/servicios/borradores';
import { ErrorNegocio } from '@/lib/servicios/expedientes';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await leerSesion();
  if (!s || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return new NextResponse('No autorizado', { status: 401 });
  const formato = req.nextUrl.searchParams.get('formato') === 'pdf' ? 'pdf' : 'docx';
  try {
    const { id } = await params;
    const b = await descargarBorrador(s, id, formato);
    return new NextResponse(new Uint8Array(b.bytes), {
      headers: {
        'Content-Type': b.mime,
        'Content-Disposition': `${formato === 'pdf' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(b.nombre)}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof ErrorNegocio) return new NextResponse(e.message, { status: 404 });
    return new NextResponse('No encontrado', { status: 404 });
  }
}
