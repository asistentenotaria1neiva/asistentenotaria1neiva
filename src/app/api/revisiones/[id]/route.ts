/**
 * Archivos de una revisión de escritura (autenticada; la descarga queda en la auditoría):
 *   ?archivo=corregida ... la escritura con los cambios marcados y la relación de cambios
 *   ?archivo=limpia ...... los mismos cambios sin marcas, para firmar
 *   ?archivo=transcrita .. la escritura transcrita en Word, sin cambios
 *   (por defecto) ........ el PDF cargado
 *   ?vista=1 ............. para el visor de la página (se muestra en pantalla en lugar de descargarse)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { leerSesion } from '@/lib/sesion';
import { descargarRevision, type ArchivoRevision } from '@/lib/servicios/revision-escrituras';

const ARCHIVOS: ArchivoRevision[] = ['corregida', 'limpia', 'transcrita'];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await leerSesion();
  if (!s || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return new NextResponse('No autorizado', { status: 401 });
  const pedido = req.nextUrl.searchParams.get('archivo') as ArchivoRevision;
  const cual: ArchivoRevision = ARCHIVOS.includes(pedido) ? pedido : 'pdf';
  const vista = req.nextUrl.searchParams.get('vista') === '1';
  try {
    const { id } = await params;
    const d = await descargarRevision(s, id, cual, vista);
    return new NextResponse(new Uint8Array(d.bytes), {
      headers: {
        'Content-Type': d.mime,
        'Content-Disposition': `${vista || cual === 'pdf' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(d.nombre)}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse('No encontrado', { status: 404 });
  }
}
