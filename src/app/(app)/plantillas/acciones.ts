'use server';
/** Acciones del revisor (y el administrador) sobre la biblioteca de plantillas */
import { revalidatePath } from 'next/cache';
import { requerirSesion } from '@/lib/sesion';
import { editarPlantilla, eliminarPlantilla, obtenerPlantilla, ErrorPlantilla } from '@/lib/servicios/plantillas';
import type { Resultado } from '../expedientes/acciones';

async function ejecutar(fn: () => Promise<string>): Promise<Resultado> {
  try {
    const ok = await fn();
    revalidatePath('/plantillas');
    return { ok };
  } catch (e) {
    if (e instanceof ErrorPlantilla) return { error: e.message };
    console.error('[plantillas]', e);
    return { error: 'Ocurrió un error inesperado. Si persiste, informe al administrador.' };
  }
}

export async function accionEditarPlantilla(id: string, _: Resultado, f: FormData): Promise<Resultado> {
  const s = await requerirSesion({ roles: ['REVISOR', 'ADMINISTRADOR'] });
  const texto = (k: string) => String(f.get(k) ?? '').trim();
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(texto('fecha')) ? new Date(`${texto('fecha')}T12:00:00-05:00`) : null;
  return ejecutar(async () => {
    await editarPlantilla(s, id, { nombre: texto('nombre'), categoria: texto('categoria'), subcategoria: texto('subcategoria') || null, fecha });
    return 'Datos de la plantilla guardados.';
  });
}

export async function accionActivarPlantilla(id: string, activa: boolean): Promise<Resultado> {
  const s = await requerirSesion({ roles: ['REVISOR', 'ADMINISTRADOR'] });
  return ejecutar(async () => {
    const p = await obtenerPlantilla(id);
    if (!p) throw new ErrorPlantilla('La plantilla no existe.');
    await editarPlantilla(s, id, { categoria: p.categoria, activa });
    return activa ? 'La plantilla vuelve a estar disponible.' : 'Plantilla retirada: ya no aparece en las búsquedas de los digitadores.';
  });
}

/** Solo el administrador elimina plantillas (el revisor puede retirarlas) */
export async function accionEliminarPlantilla(id: string): Promise<Resultado> {
  const s = await requerirSesion({ roles: ['ADMINISTRADOR'] });
  return ejecutar(async () => { await eliminarPlantilla(s, id); return 'Plantilla eliminada de la biblioteca.'; });
}
