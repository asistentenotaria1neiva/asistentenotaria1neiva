'use server';
/**
 * Acciones de las escrituras. Cada una valida la sesión y los permisos en el servidor;
 * el navegador nunca decide qué está permitido.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requerirSesion } from '@/lib/sesion';
import { crearExpediente, cambiarPlantilla, guardarObservaciones, eliminarExpediente, ErrorNegocio, type EleccionPlantilla } from '@/lib/servicios/expedientes';
import { completarDocumento, eliminarDocumento, releerDocumento, leerDocumento } from '@/lib/servicios/documentos';
import { iniciarGeneracion, iniciarAjuste, cancelarGeneracion } from '@/lib/servicios/generacion';
import { urlAplicacion } from '@/lib/seguridad/red';

export interface Resultado { error?: string; ok?: string }

async function ejecutar(fn: () => Promise<string | void>, ruta?: string): Promise<Resultado> {
  try {
    const ok = await fn();
    if (ruta) revalidatePath(ruta);
    return { ok: ok || 'Listo.' };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { error: e.message };
    if ((e as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw e;
    console.error('[accion]', e);
    return { error: 'Ocurrió un error inesperado. Si persiste, informe al administrador.' };
  }
}

/** La plantilla elegida en el formulario: de la biblioteca (plantillaId) o un .docx personal (archivo) */
async function eleccionDe(f: FormData): Promise<EleccionPlantilla> {
  const plantillaId = String(f.get('plantillaId') ?? '').trim();
  if (plantillaId) return { plantillaId };
  const archivo = f.get('archivo');
  if (!(archivo instanceof File) || !archivo.size) throw new ErrorNegocio('Elija una plantilla de la biblioteca o cargue su plantilla en Word (.docx).');
  if (!/\.docx$/i.test(archivo.name)) throw new ErrorNegocio('La plantilla personal debe ser un documento de Word .docx.');
  return { personal: { nombre: archivo.name, bytes: Buffer.from(await archivo.arrayBuffer()) } };
}

export async function accionCrearExpediente(_: Resultado, f: FormData): Promise<Resultado> {
  const s = await requerirSesion();
  let id = '';
  const r = await ejecutar(async () => { id = await crearExpediente(s, await eleccionDe(f), String(f.get('titulo') ?? '')); });
  if (r.error) return r;
  redirect(`/expedientes/${id}`);
}

export async function accionCambiarPlantilla(expedienteId: string, _: Resultado, f: FormData): Promise<Resultado> {
  const s = await requerirSesion();
  const r = await ejecutar(async () => cambiarPlantilla(s, expedienteId, await eleccionDe(f)), `/expedientes/${expedienteId}`);
  if (r.error) return r;
  redirect(`/expedientes/${expedienteId}`);
}

export async function accionGuardarObservaciones(expedienteId: string, _: Resultado, f: FormData): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => {
    await guardarObservaciones(s, expedienteId, { observaciones: String(f.get('observaciones') ?? ''), ...(f.has('titulo') ? { titulo: String(f.get('titulo') ?? '') } : {}) });
    return 'Observaciones guardadas.';
  }, `/expedientes/${expedienteId}`);
}

/** Guarda las observaciones y empieza a generar la escritura en segundo plano */
export async function accionGenerar(expedienteId: string, _: Resultado, f: FormData): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => {
    if (f.has('observaciones')) await guardarObservaciones(s, expedienteId, { observaciones: String(f.get('observaciones') ?? '') });
    const { version, tarea } = await iniciarGeneracion(s, expedienteId, await urlAplicacion());
    after(() => tarea().catch((e) => console.error('[generar]', e)));
    return `Generando la versión ${version}. Puede salir de esta página: le avisaremos en «Notificaciones» al terminar.`;
  }, `/expedientes/${expedienteId}`);
}

/**
 * Carga de documentos sin límite de tamaño: el navegador manda cada archivo en partes (api/documentos/partes)
 * y luego pide unirlas. La lectura con IA empieza enseguida, en segundo plano.
 */
export async function accionCompletarDocumento(expedienteId: string, carga: string, partes: number, nombre: string): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => {
    const id = await completarDocumento(s, expedienteId, carga, partes, String(nombre).slice(0, 300));
    if (process.env.ANTHROPIC_API_KEY) after(() => leerDocumento(id, s.usuario.id).then(() => revalidatePath(`/expedientes/${expedienteId}`)).catch((e) => console.error('[leerDocumento]', e)));
    return 'Documento cargado y cifrado.';
  }, `/expedientes/${expedienteId}`);
}

export async function accionReleerDocumento(expedienteId: string, documentoId: string): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => {
    const tarea = await releerDocumento(s, documentoId);
    after(() => tarea().catch((e) => console.error('[releerDocumento]', e)));
    return 'Leyendo el documento de nuevo…';
  }, `/expedientes/${expedienteId}`);
}

export async function accionEliminarDocumento(expedienteId: string, documentoId: string): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => { await eliminarDocumento(s, documentoId); return 'Documento retirado.'; }, `/expedientes/${expedienteId}`);
}

export async function accionEliminarExpediente(expedienteId: string): Promise<Resultado> {
  const s = await requerirSesion();
  const r = await ejecutar(() => eliminarExpediente(s, expedienteId));
  if (r.error) return r;
  redirect('/expedientes');
}

/** Detiene la generación en curso (la versión queda «cancelada»; los documentos leídos se conservan) */
export async function accionCancelarGeneracion(expedienteId: string): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => `Se canceló la generación de la versión ${await cancelarGeneracion(s, expedienteId)}.`, `/expedientes/${expedienteId}`);
}

/** Corrige la última versión según lo que pide el digitador (sin rehacerla: solo cambian los párrafos afectados) */
export async function accionCorregirVersion(expedienteId: string, _: Resultado, f: FormData): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => {
    const { version, tarea } = await iniciarAjuste(s, expedienteId, String(f.get('pedido') ?? ''), await urlAplicacion());
    after(() => tarea().catch((e) => console.error('[corregir]', e)));
    return `Corrigiendo: la versión ${version} tendrá su corrección. Le avisaremos en «Notificaciones» al terminar.`;
  }, `/expedientes/${expedienteId}`);
}
