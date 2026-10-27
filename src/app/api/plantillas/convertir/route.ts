/**
 * Conversión de una plantilla ya cargada que todavía tiene datos de un caso real (administrador y
 * revisor, auditada). Como la carga, es un Route Handler para que varias conversiones corran en
 * paralelo, cada una en su propia petición. Recibe JSON: { id } de la versión a convertir.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { leerSesion } from '@/lib/sesion';
import { ErrorPlantilla } from '@/lib/servicios/plantillas';
import { convertirPlantillaCargada } from '@/lib/servicios/carga-plantillas';

// La conversión y la revisión de la IA pueden tardar varios minutos
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const sitio = request.headers.get('sec-fetch-site');
  if (sitio && sitio !== 'same-origin') return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  const s = await leerSesion();
  if (!s || !['ADMINISTRADOR', 'REVISOR'].includes(s.usuario.rol) || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) {
    return NextResponse.json({ error: 'Su sesión terminó. Ingrese de nuevo.' }, { status: 401 });
  }
  const cuerpo = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof cuerpo?.id !== 'string' || !cuerpo.id) return NextResponse.json({ error: 'Falta la plantilla.' }, { status: 400 });
  try {
    const r = await convertirPlantillaCargada(s, cuerpo.id);
    revalidatePath('/plantillas', 'layout');
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErrorPlantilla) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error('[plantillas] conversión', e);
    return NextResponse.json({ error: 'No se pudo convertir la plantilla.' }, { status: 500 });
  }
}
