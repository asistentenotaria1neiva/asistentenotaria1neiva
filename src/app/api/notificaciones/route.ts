/**
 * Consulta periódica de notificaciones (src/app/(app)/notificaciones/Avisos.tsx): cuántas hay sin leer
 * y las nuevas desde `desde`, para mostrarlas como aviso del navegador. No cuenta como actividad: la
 * sesión se sigue cerrando por inactividad aunque la página esté abierta.
 *
 * Como cualquier pestaña abierta la hace cada 30 segundos, también reanuda (después de responder) las
 * generaciones que dejaron de avanzar porque falló el paso a su siguiente etapa.
 */
import { NextResponse, after, type NextRequest } from 'next/server';
import { leerSesion } from '@/lib/sesion';
import { noLeidas, notificacionesNuevas } from '@/lib/servicios/notificaciones';
import { generacionesPorReanudar } from '@/lib/servicios/generacion';
import { limpiezaPeriodica } from '@/lib/servicios/limpieza';

/** Una etapa reanudada corre en esta invocación */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const s = await leerSesion({ sinActividad: true });
  if (!s || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const ahora = new Date();
  const desde = new Date(request.nextUrl.searchParams.get('desde') ?? '');
  const [total, nuevas] = await Promise.all([
    noLeidas(s.usuario.id),
    Number.isNaN(desde.getTime()) ? [] : notificacionesNuevas(s.usuario.id, desde),
  ]);
  after(async () => {
    const tareas = await generacionesPorReanudar().catch((err) => { console.error('[reanudar generaciones]', err); return []; });
    await Promise.all(tareas.map((t) => t().catch((err) => console.error('[reanudar generación]', err))));
    // Borra escrituras y PDF soporte viejos (como máximo una vez cada 6 horas): src/lib/servicios/limpieza.ts
    await limpiezaPeriodica().catch((err) => console.error('[limpieza]', err));
  });
  return NextResponse.json({
    ahora: ahora.toISOString(),
    noLeidas: total,
    nuevas: nuevas.map((n) => ({ id: n.id, titulo: n.titulo, mensaje: n.mensaje, enlace: n.enlace })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
