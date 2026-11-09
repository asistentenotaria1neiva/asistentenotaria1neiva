/**
 * Una parte del PDF de una revisión de escritura (src/app/(app)/revisiones/CargaRevision.tsx). Vercel
 * limita cada petición a 4,5 MB: el navegador sube el PDF en partes y la acción accionCargarRevision
 * las une, valida y cifra. Recibe: carga (uuid), indice, parte (≤ 4 MB).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { leerSesion } from '@/lib/sesion';
import { subirParteRevision, ErrorRevisionEscritura } from '@/lib/servicios/revision-escrituras';

export async function POST(request: NextRequest) {
  // La cookie de sesión es SameSite=Strict; además se rechaza cualquier petición de otro sitio
  const sitio = request.headers.get('sec-fetch-site');
  if (sitio && sitio !== 'same-origin') return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  const s = await leerSesion();
  if (!s || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return NextResponse.json({ error: 'Su sesión terminó. Ingrese de nuevo.' }, { status: 401 });
  const f = await request.formData().catch(() => null);
  const parte = f?.get('parte');
  const indice = Number(f?.get('indice'));
  if (!f || !(parte instanceof File) || !Number.isInteger(indice) || indice < 0) return NextResponse.json({ error: 'Parte de archivo no válida.' }, { status: 400 });
  try {
    await subirParteRevision(s, String(f.get('carga') ?? ''), indice, parte);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErrorRevisionEscritura) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error('[revisiones/partes]', e);
    return NextResponse.json({ error: 'No se pudo recibir una parte del archivo.' }, { status: 500 });
  }
}
