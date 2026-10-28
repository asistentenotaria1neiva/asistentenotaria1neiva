/**
 * Actividad del usuario en la página (src/app/(app)/Actividad.tsx): quien está digitando un
 * formulario largo no hace peticiones al servidor, y la sesión se cerraba por inactividad antes de
 * guardar. Solo se llama cuando hubo teclas, clics o desplazamiento: una página abierta sin nadie
 * sigue cerrándose por inactividad.
 */
import { NextResponse } from 'next/server';
import { leerSesion } from '@/lib/sesion';

export async function POST() {
  const s = await leerSesion();
  return NextResponse.json({ ok: !!s }, { status: s ? 200 : 401, headers: { 'Cache-Control': 'no-store' } });
}
