/** Descarga/visualización individual de un documento soporte (autenticada y auditada) */
import { NextResponse } from 'next/server';
import { leerSesion } from '@/lib/sesion';
import { descargarDocumento } from '@/lib/servicios/documentos';
import { ErrorNegocio } from '@/lib/servicios/expedientes';

/**
 * El navegador guarda la copia solo para esta persona (private) y la vuelve a validar cada vez
 * (no-cache): se verifica el permiso y se audita siempre, pero si no cambió se responde 304 sin el
 * archivo, y no se vuelve a transferir el PDF completo.
 */
const CACHE = 'private, no-cache';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await leerSesion();
  if (!s || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return new NextResponse('No autorizado', { status: 401 });
  try {
    const { id } = await params;
    const d = await descargarDocumento(s, id, req.headers.get('if-none-match'));
    if (!d.bytes) return new NextResponse(null, { status: 304, headers: { ETag: d.etag, 'Cache-Control': CACHE } });
    return new NextResponse(new Uint8Array(d.bytes), {
      headers: {
        'Content-Type': d.mime,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(d.nombre)}`,
        'Cache-Control': CACHE,
        ETag: d.etag,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof ErrorNegocio) return new NextResponse(e.message, { status: 404 });
    return new NextResponse('No encontrado', { status: 404 });
  }
}
