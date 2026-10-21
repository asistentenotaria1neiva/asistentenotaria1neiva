/** Descarga/visualización individual de un documento soporte (autenticada y auditada) */
import { NextResponse } from 'next/server';
import { leerSesion } from '@/lib/sesion';
import { descargarDocumento } from '@/lib/servicios/documentos';
import { ErrorNegocio } from '@/lib/servicios/expedientes';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await leerSesion();
  if (!s || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return new NextResponse('No autorizado', { status: 401 });
  try {
    const { id } = await params;
    const d = await descargarDocumento(s, id);
    return new NextResponse(new Uint8Array(d.bytes), {
      headers: {
        'Content-Type': d.mime,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(d.nombre)}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof ErrorNegocio) return new NextResponse(e.message, { status: 404 });
    return new NextResponse('No encontrado', { status: 404 });
  }
}
