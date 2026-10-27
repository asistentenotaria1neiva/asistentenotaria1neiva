/**
 * Una parte de un documento que se carga en varias peticiones (src/app/(app)/expedientes/formularios.tsx).
 * Es un Route Handler y no una acción del servidor porque Next.js ejecuta las acciones de un cliente
 * una por una: así el navegador sube varias partes a la vez. Al terminar, la acción
 * accionCompletarDocumento las une, valida y cifra el documento.
 * Recibe: expedienteId, carga (uuid de la carga), indice, parte (≤ 4 MB).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { leerSesion } from '@/lib/sesion';
import { subirParteDocumento } from '@/lib/servicios/documentos';
import { ErrorNegocio } from '@/lib/servicios/expedientes';

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
    await subirParteDocumento(s, String(f.get('expedienteId') ?? ''), String(f.get('carga') ?? ''), indice, parte);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErrorNegocio) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error('[documentos/partes]', e);
    return NextResponse.json({ error: 'No se pudo recibir una parte del archivo.' }, { status: 500 });
  }
}
