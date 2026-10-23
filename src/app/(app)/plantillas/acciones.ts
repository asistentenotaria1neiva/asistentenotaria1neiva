'use server';
/**
 * Acciones del panel de plantillas.
 *  - Administrador y revisor: cargar versiones y pedir la revisión de la IA.
 *  - Solo el administrador (con doble factor): aprobar y retirar, por indicación del notario.
 * Todo queda en la auditoría.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { db } from '@/lib/db';
import { requerirSesion, datosAuditoria } from '@/lib/sesion';
import { auditar } from '@/lib/auditoria';
import { cargarPlantilla, aprobarPlantilla, retirarPlantilla, ErrorPlantilla } from '@/lib/servicios/plantillas';
import { revisarPlantilla } from '@/lib/servicios/revision-plantillas';
import { proponerCorreccionesPlantilla, aplicarCorreccionesPlantilla } from '@/lib/servicios/correccion-plantillas';
import type { ResultadoAdmin } from '../admin/acciones';

const revisores = () => requerirSesion({ roles: ['ADMINISTRADOR', 'REVISOR'] });
const t = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

export async function accionCargarPlantilla(_: ResultadoAdmin, f: FormData): Promise<ResultadoAdmin> {
  const s = await revisores();
  const archivo = f.get('archivo');
  if (!(archivo instanceof File) || !archivo.size) return { error: 'Seleccione un archivo .docx.' };
  const tipoId = t(f, 'tipoId');
  if (!(await db.tipoEscritura.findUnique({ where: { id: tipoId } }))) return { error: 'Tipo de escritura no válido.' };
  let id: string;
  try {
    const p = await cargarPlantilla(tipoId, archivo.name.slice(0, 120), Buffer.from(await archivo.arrayBuffer()), s.usuario.id, t(f, 'notas') || undefined);
    await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_CARGADA', entidad: 'plantilla', entidadId: p.id, detalle: { tipoId, version: p.version, sha256: p.hashSha256 } });
    id = p.id;
  } catch (e) {
    if (e instanceof ErrorPlantilla) return { error: e.message };
    console.error('[plantillas]', e);
    return { error: 'No se pudo cargar la plantilla.' };
  }
  // La revisión no impide la carga: si la IA falla, el error queda en la versión y se puede repetir
  await revisarPlantilla(id, s).catch((e) => console.error('[plantillas] revisión', e));
  revalidatePath('/plantillas');
  redirect(`/plantillas/${id}`);
}

export async function accionRevisarPlantilla(_: ResultadoAdmin, f: FormData): Promise<ResultadoAdmin> {
  const s = await revisores();
  const id = t(f, 'id');
  try {
    const r = await revisarPlantilla(id, s);
    revalidatePath(`/plantillas/${id}`);
    return r.errorIA ? { error: `La verificación automática se actualizó, pero la IA no respondió: ${r.errorIA}` } : { ok: 'Revisión actualizada.' };
  } catch (e) {
    console.error('[plantillas]', e);
    return { error: 'No se pudo revisar la plantilla.' };
  }
}

/** Pide a la IA las correcciones de los hallazgos elegidos (se preparan en segundo plano) */
export async function accionProponerCorreccionesPlantilla(id: string, hallazgos: string[]): Promise<ResultadoAdmin> {
  const s = await revisores();
  try {
    const r = await proponerCorreccionesPlantilla(s, id, hallazgos.map(Number));
    after(r.tarea);
    revalidatePath(`/plantillas/${id}`);
    return { ok: `La IA está preparando las correcciones de ${r.hallazgos} hallazgo(s).` };
  } catch (e) {
    if (e instanceof ErrorPlantilla) return { error: e.message };
    console.error('[plantillas]', e);
    return { error: 'No se pudieron pedir las correcciones.' };
  }
}

/** Aplica las correcciones elegidas en una nueva versión y lleva a ella; sin índices, descarta la propuesta */
export async function accionAplicarCorreccionesPlantilla(id: string, indices: number[]): Promise<ResultadoAdmin> {
  const s = await revisores();
  let nuevaId: string | null;
  try {
    const r = await aplicarCorreccionesPlantilla(s, id, indices);
    nuevaId = r.nuevaId;
    revalidatePath('/plantillas', 'layout');
    if (!nuevaId) return r.fallidas.length ? { error: `No se pudo aplicar ningún cambio: ${r.fallidas.join('; ')}` } : { ok: 'Propuesta descartada: la plantilla no cambió.' };
  } catch (e) {
    if (e instanceof ErrorPlantilla) return { error: e.message };
    console.error('[plantillas]', e);
    return { error: 'No se pudieron aplicar las correcciones.' };
  }
  redirect(`/plantillas/${nuevaId}?corregida=1`);
}

export async function accionPlantilla(_: ResultadoAdmin, f: FormData): Promise<ResultadoAdmin> {
  const s = await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const id = t(f, 'id');
  const op = t(f, 'operacion');
  try {
    let mensaje: string;
    if (op === 'aprobar') {
      if (t(f, 'confirmacion') !== 'APROBADA POR EL NOTARIO') return { error: 'Para aprobar escriba exactamente: APROBADA POR EL NOTARIO' };
      const p = await aprobarPlantilla(id, s.usuario.id);
      await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_APROBADA', entidad: 'plantilla', entidadId: id, detalle: { tipoId: p.tipoId, version: p.version } });
      mensaje = 'Plantilla aprobada; la versión aprobada anterior (si había) quedó retirada.';
    } else if (op === 'retirar') {
      const p = await retirarPlantilla(id);
      await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_RETIRADA', entidad: 'plantilla', entidadId: id, detalle: { tipoId: p.tipoId, version: p.version } });
      mensaje = 'Plantilla retirada.';
    } else return { error: 'Operación no válida.' };
    revalidatePath('/plantillas', 'layout');
    return { ok: mensaje };
  } catch (e) {
    if (e instanceof ErrorPlantilla) return { error: e.message };
    console.error('[plantillas]', e);
    return { error: 'No se pudo completar la acción.' };
  }
}
