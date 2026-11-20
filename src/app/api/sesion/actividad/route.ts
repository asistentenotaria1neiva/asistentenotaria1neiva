/**
 * Actividad del usuario en la página (src/app/(app)/Actividad.tsx): quien está digitando un
 * formulario largo no hace peticiones al servidor, y la sesión se cerraba por inactividad antes de
 * guardar. Solo se llama cuando hubo teclas, clics o desplazamiento: una página abierta sin nadie
 * sigue cerrándose por inactividad.
 * Aprovecha el aviso para renovar la caché de las instrucciones de redacción antes de que venza
 * (src/lib/servicios/cache-redaccion.ts), después de responder.
 */
import { NextResponse, after } from 'next/server';
import { leerSesion } from '@/lib/sesion';
import { mantenerCacheRedaccion } from '@/lib/servicios/cache-redaccion';

export async function POST() {
  const s = await leerSesion();
  if (s) after(() => mantenerCacheRedaccion());
  return NextResponse.json({ ok: !!s }, { status: s ? 200 : 401, headers: { 'Cache-Control': 'no-store' } });
}
