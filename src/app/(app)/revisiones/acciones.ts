'use server';
/**
 * Acciones de la revisión de escrituras de sucesión (todos los roles; cada digitador ve las suyas).
 * La revisión corre por etapas en segundo plano: la página muestra el avance.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requerirSesion } from '@/lib/sesion';
import { urlAplicacion } from '@/lib/seguridad/red';
import { cargarRevision, reanalizarRevision, aplicarCambios, eliminarRevision, ErrorRevisionEscritura } from '@/lib/servicios/revision-escrituras';

export interface ResultadoRevision { error?: string; ok?: string }

function fallo(e: unknown, mensaje: string): ResultadoRevision {
  if (e instanceof ErrorRevisionEscritura) return { error: e.message };
  console.error('[revisiones]', e);
  return { error: mensaje };
}

/** Une las partes del PDF ya subidas (api/revisiones/partes) e inicia la revisión */
export async function accionCargarRevision(datos: { carga: string; partes: number; nombre: string; tipoId: string; notas: string }): Promise<ResultadoRevision> {
  const s = await requerirSesion();
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'La IA no está configurada en el servidor (ANTHROPIC_API_KEY).' };
  let id: string;
  try {
    const r = await cargarRevision(s, { carga: datos.carga, partes: datos.partes, nombreArchivo: datos.nombre, tipoId: datos.tipoId, notas: datos.notas.trim() || undefined }, await urlAplicacion());
    after(r.etapa);
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
    const r = await reanalizarRevision(s, id, await urlAplicacion());
    after(r.etapa);
  } catch (e) {
    return fallo(e, 'No se pudo iniciar la revisión.');
  }
  revalidatePath('/revisiones', 'layout');
  return { ok: 'La IA está revisando la escritura de nuevo.' };
}

/** Genera la escritura con los cambios elegidos (por número); sin números, descarta la corregida */
export async function accionAplicarCambios(id: string, numeros: number[]): Promise<ResultadoRevision> {
  const s = await requerirSesion();
  try {
    const r = await aplicarCambios(s, id, numeros);
    revalidatePath(`/revisiones/${id}`);
    if (!numeros.length) return { ok: 'Se descartó la escritura corregida.' };
    if (!r.aplicados) return { error: `No se pudo aplicar ningún cambio: ${r.fallidas.join('; ')}` };
    return { ok: `Escritura generada con ${r.aplicados} cambio(s) marcados y su relación al final.${r.fallidas.length ? ` ${r.fallidas.length} no se pudieron aplicar (ver abajo).` : ''} Descárguela y revísela en Word.` };
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
