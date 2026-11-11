/** La plantilla de una escritura (de la biblioteca o personal), para verla o descargarla */
import { NextResponse, type NextRequest } from 'next/server';
import { leerSesion } from '@/lib/sesion';
import { obtenerExpediente, bytesPlantilla } from '@/lib/servicios/expedientes';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await leerSesion();
  if (!s || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return new NextResponse('No autorizado', { status: 401 });
  try {
    const { id } = await params;
    const e = await obtenerExpediente(s, id);
    const bytes = await bytesPlantilla(e);
    const vista = req.nextUrl.searchParams.get('vista') === '1';
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `${vista ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(`${e.plantillaNombre}.docx`)}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('No encontrado', { status: 404 });
  }
}
