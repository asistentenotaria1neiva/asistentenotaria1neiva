/**
 * Registro de avisos push (src/app/(app)/notificaciones/Avisos.tsx): el navegador entrega aquí su
 * suscripción (POST) o la retira (DELETE). Los avisos los envía src/lib/servicios/push.ts.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { leerSesion } from '@/lib/sesion';
import { esSuscripcionValida, guardarSuscripcion, quitarSuscripcion } from '@/lib/servicios/push';

const SIN_CACHE = { 'Cache-Control': 'no-store' };

async function sesion() {
  const s = await leerSesion({ sinActividad: true });
  if (!s || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return null;
  return s;
}

export async function POST(request: NextRequest) {
  const s = await sesion();
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: SIN_CACHE });
  const cuerpo: unknown = await request.json().catch(() => null);
  if (!esSuscripcionValida(cuerpo)) return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400, headers: SIN_CACHE });
  await guardarSuscripcion(s.usuario.id, cuerpo);
  return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
}

export async function DELETE(request: NextRequest) {
  const s = await sesion();
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: SIN_CACHE });
  const cuerpo = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof cuerpo?.endpoint === 'string') await quitarSuscripcion(s.usuario.id, cuerpo.endpoint);
  return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
}
