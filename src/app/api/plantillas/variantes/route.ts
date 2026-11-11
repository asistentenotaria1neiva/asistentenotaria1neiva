/**
 * La IA escribe el nombre y «cuándo usarla» de las variantes recién cargadas de un tipo de escritura
 * (administrador y revisor, auditada). La llama la carga de plantillas cuando termina de subir varias
 * variantes sin criterios escritos. Recibe JSON: { tipoId, ids } (las versiones recién cargadas).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { leerSesion } from '@/lib/sesion';
import { ErrorPlantilla } from '@/lib/servicios/plantillas';
import { generarCriteriosVariantes } from '@/lib/servicios/criterios-variantes';

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const sitio = request.headers.get('sec-fetch-site');
  if (sitio && sitio !== 'same-origin') return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  const s = await leerSesion();
  if (!s || !['ADMINISTRADOR', 'REVISOR'].includes(s.usuario.rol) || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) {
    return NextResponse.json({ error: 'Su sesión terminó. Ingrese de nuevo.' }, { status: 401 });
  }
  const cuerpo = (await request.json().catch(() => null)) as { tipoId?: unknown; ids?: unknown } | null;
  const tipoId = typeof cuerpo?.tipoId === 'string' ? cuerpo.tipoId : '';
  const ids = Array.isArray(cuerpo?.ids) ? cuerpo.ids.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
  if (!tipoId || !ids.length) return NextResponse.json({ error: 'Faltan las variantes.' }, { status: 400 });
  try {
    const r = await generarCriteriosVariantes(s, tipoId, ids);
    revalidatePath('/plantillas', 'layout');
    return NextResponse.json({ variantes: r });
  } catch (e) {
    if (e instanceof ErrorPlantilla) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error('[plantillas] criterios de variantes', e);
    return NextResponse.json({ error: 'No se pudo escribir cuándo usar cada variante.' }, { status: 500 });
  }
}
