'use server';
/**
 * Acciones del panel de plantillas.
 *  - Administrador y revisor: cargar versiones y pedir la revisión de la IA.
 *  - Administrador y revisor: eliminar una versión o la plantilla completa (no las usadas en borradores).
 *  - Solo el administrador (con doble factor): aprobar y retirar, por indicación del notario.
 * Todo queda en la auditoría.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requerirSesion, datosAuditoria } from '@/lib/sesion';
import { auditar } from '@/lib/auditoria';
import { aprobarPlantilla, retirarPlantilla, eliminarVersionPlantilla, eliminarPlantillaCompleta, aprobarPendientesDeVariantes, actualizarVariante, cambiarVariantes, nombreVariante, ErrorPlantilla } from '@/lib/servicios/plantillas';
import { db } from '@/lib/db';
import { iniciarRevisionPlantilla, ErrorRevision } from '@/lib/servicios/revision-plantillas';
import { cargarYRevisarPlantilla } from '@/lib/servicios/carga-plantillas';
import { proponerCorreccionesPlantilla, aplicarCorreccionesPlantilla } from '@/lib/servicios/correccion-plantillas';
import type { ResultadoAdmin } from '../admin/acciones';

const revisores = () => requerirSesion({ roles: ['ADMINISTRADOR', 'REVISOR'] });
const t = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

export async function accionCargarPlantilla(_: ResultadoAdmin, f: FormData): Promise<ResultadoAdmin> {
  const s = await revisores();
  const archivo = f.get('archivo');
  if (!(archivo instanceof File) || !archivo.size) return { error: 'Seleccione un archivo .docx.' };
  let id: string;
  try {
    // Si el archivo es un caso real, la IA cambia sus datos por variables antes de guardarlo
    ({ id } = await cargarYRevisarPlantilla(s, {
      tipoId: t(f, 'tipoId'), nombreArchivo: archivo.name.slice(0, 120), archivo: Buffer.from(await archivo.arrayBuffer()), notas: t(f, 'notas') || undefined,
      // Tipos con variantes: a qué variante pertenece (o, con nuevaVariante, una variante nueva)
      variante: t(f, 'variante') || undefined, criterios: t(f, 'criterios') || undefined, nuevaVariante: t(f, 'nuevaVariante') === '1',
    }));
  } catch (e) {
    if (e instanceof ErrorPlantilla) return { error: e.message };
    console.error('[plantillas]', e);
    return { error: 'No se pudo cargar la plantilla.' };
  }
  revalidatePath('/plantillas');
  redirect(`/plantillas/${id}`);
}

/** Inicia la revisión de la IA en segundo plano: el usuario puede salir de la página mientras tanto */
export async function accionRevisarPlantilla(_: ResultadoAdmin, f: FormData): Promise<ResultadoAdmin> {
  const s = await revisores();
  const id = t(f, 'id');
  try {
    const r = await iniciarRevisionPlantilla(id, s);
    after(r.tarea);
    revalidatePath('/plantillas', 'layout');
    return { ok: 'La IA está revisando la plantilla. Puede salir de esta página: en el listado verá «Analizando con IA…» hasta que termine.' };
  } catch (e) {
    if (e instanceof ErrorRevision) return { error: e.message };
    console.error('[plantillas]', e);
    return { error: 'No se pudo iniciar la revisión de la plantilla.' };
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

/** Elimina una versión o la plantilla completa (todas sus versiones) de un tipo; el tipo de escritura queda */
export async function accionEliminarPlantilla(_: ResultadoAdmin, f: FormData): Promise<ResultadoAdmin> {
  const s = await revisores();
  const id = t(f, 'id');
  let destino = '/plantillas';
  try {
    if (t(f, 'operacion') === 'completa') {
      const tipoId = t(f, 'tipoId');
      const versiones = await eliminarPlantillaCompleta(tipoId);
      await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_ELIMINADA', entidad: 'tipo_escritura', entidadId: tipoId, detalle: { tipoId, versiones } });
    } else {
      const p = await eliminarVersionPlantilla(id);
      await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_VERSION_ELIMINADA', entidad: 'plantilla', entidadId: id, detalle: { tipoId: p.tipoId, version: p.version, estado: p.estado, sha256: p.hashSha256 } });
      // Se sigue en la versión más reciente que quede, si hay
      const otra = await db.plantilla.findFirst({ where: { tipoId: p.tipoId }, orderBy: { version: 'desc' }, select: { id: true } });
      if (otra) destino = `/plantillas/${otra.id}`;
    }
  } catch (e) {
    if (e instanceof ErrorPlantilla) return { error: e.message };
    console.error('[plantillas]', e);
    return { error: 'No se pudo eliminar la plantilla.' };
  }
  revalidatePath('/plantillas', 'layout');
  redirect(destino);
}

/** Nombre y criterios de elección de una variante (administrador y revisor). No cambia el texto del modelo. */
export async function accionVariante(_: ResultadoAdmin, f: FormData): Promise<ResultadoAdmin> {
  const s = await revisores();
  const id = t(f, 'id');
  try {
    const p = await actualizarVariante(id, { variante: t(f, 'variante'), criterios: t(f, 'criterios') });
    await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_VARIANTE_EDITADA', entidad: 'plantilla', entidadId: id, detalle: { tipoId: p.tipoId, version: p.version, variante: p.variante, criterios: p.criterios } });
  } catch (e) {
    if (e instanceof ErrorPlantilla) return { error: e.message };
    console.error('[plantillas]', e);
    return { error: 'No se pudo guardar la variante.' };
  }
  revalidatePath('/plantillas', 'layout');
  return { ok: 'Variante guardada. La IA usará estos criterios para elegirla.' };
}

/** Aprueba de una vez las variantes pendientes de un tipo (solo administrador, con la misma confirmación) */
export async function accionAprobarVariantes(_: ResultadoAdmin, f: FormData): Promise<ResultadoAdmin> {
  const s = await requerirSesion({ roles: ['ADMINISTRADOR'] });
  if (t(f, 'confirmacion') !== 'APROBADA POR EL NOTARIO') return { error: 'Para aprobar escriba exactamente: APROBADA POR EL NOTARIO' };
  try {
    const aprobadas = await aprobarPendientesDeVariantes(t(f, 'tipoId'), s.usuario.id);
    for (const p of aprobadas) await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_APROBADA', entidad: 'plantilla', entidadId: p.id, detalle: { tipoId: p.tipoId, version: p.version, variante: nombreVariante(p), enBloque: true } });
    revalidatePath('/plantillas', 'layout');
    return { ok: `${aprobadas.length} variante(s) aprobada(s). Desde ahora la IA elige entre ellas según los documentos de cada caso.` };
  } catch (e) {
    if (e instanceof ErrorPlantilla) return { error: e.message };
    console.error('[plantillas]', e);
    return { error: 'No se pudieron aprobar las variantes.' };
  }
}

/** Activa o desactiva que un tipo tenga varias plantillas aprobadas (variantes); solo administrador */
export async function accionCambiarVariantes(_: ResultadoAdmin, f: FormData): Promise<ResultadoAdmin> {
  const s = await requerirSesion({ roles: ['ADMINISTRADOR'] });
  const tipoId = t(f, 'tipoId');
  const activar = t(f, 'operacion') === 'activar';
  try {
    await cambiarVariantes(tipoId, activar);
    await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_VARIANTES', entidad: 'tipo_escritura', entidadId: tipoId, detalle: { variantes: activar } });
  } catch (e) {
    if (e instanceof ErrorPlantilla) return { error: e.message };
    console.error('[plantillas]', e);
    return { error: 'No se pudo cambiar la configuración.' };
  }
  revalidatePath('/plantillas', 'layout');
  return { ok: activar ? 'Este tipo ahora admite varias plantillas (variantes). Agregue cada variante con su nombre y cuándo usarla.' : 'Este tipo vuelve a tener una sola plantilla aprobada.' };
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
      await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_APROBADA', entidad: 'plantilla', entidadId: id, detalle: { tipoId: p.tipoId, version: p.version, ...(p.variante ? { variante: p.variante } : {}) } });
      mensaje = p.variante
        ? `Variante «${nombreVariante(p)}» aprobada${p.retiradas ? '; su versión aprobada anterior quedó retirada' : ''}. Las demás variantes siguen vigentes.`
        : 'Plantilla aprobada; la versión aprobada anterior (si había) quedó retirada.';
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
