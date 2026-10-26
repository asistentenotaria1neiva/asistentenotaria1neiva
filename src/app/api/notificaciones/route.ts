/**
 * Consulta periódica de notificaciones (src/app/(app)/notificaciones/Avisos.tsx): cuántas hay sin leer
 * y las nuevas desde `desde`, para mostrarlas como aviso del navegador. No cuenta como actividad: la
 * sesión se sigue cerrando por inactividad aunque la página esté abierta.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { leerSesion } from '@/lib/sesion';
import { noLeidas, notificacionesNuevas } from '@/lib/servicios/notificaciones';

export async function GET(request: NextRequest) {
  const s = await leerSesion({ sinActividad: true });
  if (!s || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const ahora = new Date();
  const desde = new Date(request.nextUrl.searchParams.get('desde') ?? '');
  const [total, nuevas] = await Promise.all([
    noLeidas(s.usuario.id),
    Number.isNaN(desde.getTime()) ? [] : notificacionesNuevas(s.usuario.id, desde),
  ]);
  return NextResponse.json({
    ahora: ahora.toISOString(),
    noLeidas: total,
    nuevas: nuevas.map((n) => ({ id: n.id, titulo: n.titulo, mensaje: n.mensaje, enlace: n.enlace })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
