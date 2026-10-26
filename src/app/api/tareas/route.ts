/**
 * Siguiente etapa de un análisis en segundo plano (src/lib/servicios/tareas.ts). La llama la propia
 * aplicación al terminar una etapa, para que la siguiente corra en una invocación nueva con su propio
 * límite de tiempo. No usa la sesión: la petición va firmada con CLAVE_FIRMA (id y turno de la tarea),
 * y una firma vieja o repetida no hace nada porque cada etapa toma su turno.
 */
import { NextResponse, after, type NextRequest } from 'next/server';
import { ejecutarEtapa, firmaValida } from '@/lib/servicios/tareas';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const cuerpo = await request.json().catch(() => null) as { id?: unknown; turno?: unknown; firma?: unknown } | null;
  const id = typeof cuerpo?.id === 'string' ? cuerpo.id : '';
  const turno = typeof cuerpo?.turno === 'number' && Number.isInteger(cuerpo.turno) ? cuerpo.turno : -1;
  if (!id || turno < 0 || typeof cuerpo?.firma !== 'string' || !firmaValida(id, turno, cuerpo.firma)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  // Se responde de inmediato: la etapa corre después, en esta misma invocación
  after(() => ejecutarEtapa(id, turno).catch((e) => console.error('[api/tareas]', e)));
  return NextResponse.json({ ok: true }, { status: 202 });
}
