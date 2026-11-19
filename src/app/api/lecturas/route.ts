/**
 * Continuación de la lectura de un documento largo (src/lib/servicios/documentos.ts): la pide la propia
 * aplicación cuando una invocación se acerca a su límite de 5 minutos, para que los tramos que faltan se
 * lean enseguida en una invocación nueva. No usa la sesión: la petición va firmada con CLAVE_FIRMA
 * (documento y usuario), y repetirla no hace nada si el documento ya lo está leyendo otra invocación.
 */
import { NextResponse, after, type NextRequest } from 'next/server';
import { firmaLecturaValida } from '@/lib/servicios/tareas';
import { leerDocumento } from '@/lib/servicios/documentos';
import { urlAplicacion } from '@/lib/seguridad/red';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const cuerpo = await request.json().catch(() => null) as { id?: unknown; usuario?: unknown; firma?: unknown } | null;
  const id = typeof cuerpo?.id === 'string' ? cuerpo.id : '';
  const usuario = typeof cuerpo?.usuario === 'string' ? cuerpo.usuario : '';
  if (!id || !usuario || typeof cuerpo?.firma !== 'string' || !firmaLecturaValida(id, usuario, cuerpo.firma)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const base = await urlAplicacion();
  // Se responde de inmediato: la lectura corre después, en esta misma invocación
  after(() => leerDocumento(id, usuario, { base }).catch((e) => console.error('[api/lecturas]', e)));
  return NextResponse.json({ ok: true }, { status: 202 });
}
