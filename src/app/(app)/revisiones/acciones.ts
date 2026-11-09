'use server';
/**
 * Acciones de la revisión de escrituras ya hechas (todos los roles; cada digitador ve las suyas).
 * El análisis de la IA corre después de responder: la página muestra el avance.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requerirSesion } from '@/lib/sesion';
import { cargarRevision, reanalizarRevision, aplicarCambios, eliminarRevision, ErrorRevisionEscritura } from '@/lib/servicios/revision-escrituras';

export interface ResultadoRevision { error?: string; ok?: string }

const t = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

function fallo(e: unknown, mensaje: string): ResultadoRevision {
  if (e instanceof ErrorRevisionEscritura) return { error: e.message };
  console.error('[revisiones]', e);
  return { error: mensaje };
}

export async function accionCargarRevision(_: ResultadoRevision, f: FormData): Promise<ResultadoRevision> {
  const s = await requerirSesion();
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'La IA no está configurada en el servidor (ANTHROPIC_API_KEY).' };
  const archivo = f.get('archivo');
  if (!(archivo instanceof File) || !archivo.size) return { error: 'Seleccione la escritura en Word (.docx).' };
  let id: string;
  try {
    const r = await cargarRevision(s, { nombreArchivo: archivo.name, archivo: Buffer.from(await archivo.arrayBuffer()), tipoId: t(f, 'tipoId') || undefined, notas: t(f, 'notas') || undefined });
    after(r.tarea);
    id = r.id;
  } catch (e) {
    return fallo(e, 'No se pudo cargar la escritura.');
  }
  revalidatePath('/revisiones');
  redirect(`/revisiones/${id}`);
}

export async function accionReanalizar(id: string): Promise<ResultadoRevision> {
  const s = await requerirSesion();
  try {
    const r = await reanalizarRevision(s, id);
    after(r.tarea);
  } catch (e) {
    return fallo(e, 'No se pudo iniciar el análisis.');
  }
  revalidatePath('/revisiones', 'layout');
  return { ok: 'La IA está analizando la escritura de nuevo.' };
}

/** Aplica los cambios elegidos en una copia del original; sin índices, descarta la copia */
export async function accionAplicarCambios(id: string, indices: number[]): Promise<ResultadoRevision> {
  const s = await requerirSesion();
  try {
    const r = await aplicarCambios(s, id, indices);
    revalidatePath(`/revisiones/${id}`);
    if (!indices.length) return { ok: 'Se descartó la versión corregida: queda solo el original.' };
    if (!r.aplicadas) return { error: `No se pudo aplicar ningún cambio: ${r.fallidas.join('; ')}` };
    return { ok: `Se aplicaron ${r.aplicadas} cambio(s) en una copia de la escritura; el original no cambió.${r.fallidas.length ? ` ${r.fallidas.length} no se pudieron aplicar (ver abajo).` : ''} Descárguela y revísela en Word.` };
  } catch (e) {
    return fallo(e, 'No se pudieron aplicar los cambios.');
  }
}

export async function accionEliminarRevision(id: string): Promise<ResultadoRevision> {
  const s = await requerirSesion();
  try {
    await eliminarRevision(s, id);
  } catch (e) {
    return fallo(e, 'No se pudo eliminar la revisión.');
  }
  revalidatePath('/revisiones');
  redirect('/revisiones');
}
