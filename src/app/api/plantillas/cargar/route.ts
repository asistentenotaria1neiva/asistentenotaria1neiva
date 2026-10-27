/**
 * Carga de una plantilla desde la carga de varias a la vez (administrador y revisor, auditada).
 * Es un Route Handler y no una acción del servidor porque Next.js ejecuta las acciones de un
 * cliente una por una: así cada archivo va en su propia petición y los análisis corren en paralelo
 * (cada uno con su propio límite de tiempo y de tamaño).
 * Recibe: archivo (.docx), tipoId, notas, convertir ("1" para convertir un caso real en plantilla) y
 * otros (.docx de otros casos del mismo tipo, opcionales, para que la IA compare al convertir).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { leerSesion } from '@/lib/sesion';
import { ErrorPlantilla } from '@/lib/servicios/plantillas';
import { cargarYRevisarPlantilla } from '@/lib/servicios/carga-plantillas';

// La conversión del caso real y la revisión de la IA pueden tardar varios minutos
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // La cookie de sesión es SameSite=Strict; además se rechaza cualquier petición de otro sitio
  const sitio = request.headers.get('sec-fetch-site');
  if (sitio && sitio !== 'same-origin') return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  const s = await leerSesion();
  if (!s || !['ADMINISTRADOR', 'REVISOR'].includes(s.usuario.rol) || (s.usuario.rol === 'ADMINISTRADOR' && !s.segundoFactorOk)) {
    return NextResponse.json({ error: 'Su sesión terminó. Ingrese de nuevo.' }, { status: 401 });
  }
  const f = await request.formData().catch(() => null);
  const archivo = f?.get('archivo');
  if (!f || !(archivo instanceof File) || !archivo.size) return NextResponse.json({ error: 'Seleccione un archivo .docx.' }, { status: 400 });
  try {
    const r = await cargarYRevisarPlantilla(s, {
      tipoId: String(f.get('tipoId') ?? ''),
      nombreArchivo: archivo.name.slice(0, 120),
      archivo: Buffer.from(await archivo.arrayBuffer()),
      notas: String(f.get('notas') ?? '').trim().slice(0, 4000) || undefined,
      convertir: f.get('convertir') === '1',
      otros: await Promise.all(f.getAll('otros').filter((o): o is File => o instanceof File && o.size > 0).slice(0, 5).map(async (o) => Buffer.from(await o.arrayBuffer()))),
    });
    revalidatePath('/plantillas', 'layout');
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErrorPlantilla) return NextResponse.json({ error: e.message }, { status: 422 });
    console.error('[plantillas] carga', e);
    return NextResponse.json({ error: 'No se pudo cargar la plantilla.' }, { status: 500 });
  }
}
