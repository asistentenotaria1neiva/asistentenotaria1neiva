/**
 * El revisor (o el administrador) agrega una plantilla a la biblioteca. Es un Route Handler y no una
 * acción del servidor para que varios archivos suban a la vez (cada uno en su propia petición).
 * Recibe: archivo (.docx), categoria, subcategoria, nombre y fecha (AAAA-MM-DD), opcionales salvo la categoría.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { leerSesion } from '@/lib/sesion';
import { agregarPlantilla, puedeAdministrar, ErrorPlantilla } from '@/lib/servicios/plantillas';

export async function POST(request: NextRequest) {
  const sitio = request.headers.get('sec-fetch-site');
  if (sitio && sitio !== 'same-origin') return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  const s = await leerSesion();
  if (!s || !puedeAdministrar(s) || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) return NextResponse.json({ error: 'Su sesión terminó o no tiene permiso.' }, { status: 401 });
  const f = await request.formData().catch(() => null);
  const archivo = f?.get('archivo');
  if (!f || !(archivo instanceof File) || !archivo.size) return NextResponse.json({ error: 'Seleccione un archivo .docx.' }, { status: 400 });
  const texto = (k: string) => String(f.get(k) ?? '').trim();
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(texto('fecha')) ? new Date(`${texto('fecha')}T12:00:00-05:00`) : null;
  try {
    const p = await agregarPlantilla(s, Buffer.from(await archivo.arrayBuffer()), archivo.name, {
      categoria: texto('categoria'), subcategoria: texto('subcategoria') || null, nombre: texto('nombre') || undefined, fecha,
    });
    revalidatePath('/plantillas');
    return NextResponse.json({ ok: true, id: p.id, nombre: p.nombre });
  } catch (e) {
    if (e instanceof ErrorPlantilla) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error('[plantillas/cargar]', e);
    return NextResponse.json({ error: 'No se pudo agregar la plantilla.' }, { status: 500 });
  }
}
