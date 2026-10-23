'use server';
/**
 * Acciones de los expedientes. Cada una valida la sesión y los permisos en el servidor;
 * el navegador nunca decide qué está permitido.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requerirSesion } from '@/lib/sesion';
import {
  crearExpediente, enviarARevision, aprobarExpediente,
  devolverExpediente, marcarFirmada, archivarExpediente, reabrirExpediente, reasignarExpediente, ErrorNegocio,
} from '@/lib/servicios/expedientes';
import { subirDocumento, analizarDocumento, eliminarDocumento } from '@/lib/servicios/documentos';
import { iniciarAsistente, responderAsistente, continuarConDatos, agregarPregunta, type RespuestasAsistente } from '@/lib/servicios/asistente';
import { ejecutarRevision, resolverObservacion } from '@/lib/servicios/revision';
import { proponerCorrecciones, aplicarCorrecciones } from '@/lib/servicios/correccion-ia';
import { generarBorradorExpediente } from '@/lib/servicios/borradores';
import { db } from '@/lib/db';
import type { Errores } from '@/lib/escritura/validar-formulario';

export interface Resultado { error?: string; ok?: string; errores?: Errores }

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

export async function accionCrearExpediente(_: Resultado, f: FormData): Promise<Resultado> {
  const s = await requerirSesion();
  const actos = String(f.get('actos') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  let id = '';
  const r = await ejecutar(async () => { id = await crearExpediente(s, actos); });
  if (r.error) return r;
  redirect(`/expedientes/${id}/documentos`);
}


export async function accionSubirDocumento(expedienteId: string, _: Resultado, f: FormData): Promise<Resultado> {
  const s = await requerirSesion();
  const archivos = f.getAll('archivo').filter((x): x is File => x instanceof File && x.size > 0);
  if (!archivos.length) return { error: 'Seleccione al menos un archivo.' };
  return ejecutar(async () => {
    for (const a of archivos) await subirDocumento(s, expedienteId, a, String(f.get('tipo') ?? 'OTRO'));
    return `${archivos.length} documento(s) cargado(s) y cifrado(s).`;
  }, `/expedientes/${expedienteId}/documentos`);
}

export async function accionAnalizarDocumento(expedienteId: string, documentoId: string): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => {
    const r = await analizarDocumento(s, documentoId);
    return `Análisis completado: ${r.sugerencias} dato(s) sugerido(s).`;
  }, `/expedientes/${expedienteId}/documentos`);
}

export async function accionAnalizarPendientes(expedienteId: string): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => {
    const docs = await db.documento.findMany({ where: { expedienteId, estadoAnalisis: { in: ['PENDIENTE', 'ERROR'] } } });
    let total = 0;
    const errores: string[] = [];
    for (const d of docs) {
      try { total += (await analizarDocumento(s, d.id)).sugerencias; } catch (e) { errores.push(`${d.nombreOriginal}: ${(e as Error).message}`); }
    }
    if (errores.length) throw new ErrorNegocio(`Se analizaron ${docs.length - errores.length} de ${docs.length}. ${errores.join(' | ')}`);
    return `Se analizaron ${docs.length} documento(s): ${total} dato(s) sugerido(s).`;
  }, `/expedientes/${expedienteId}/documentos`);
}

export async function accionRevisar(expedienteId: string, conIA: boolean): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => {
    const r = await ejecutarRevision(s, expedienteId, conIA);
    const base = `Revisión ejecutada: ${r.hallazgos} hallazgo(s) de las reglas (${r.nuevasReglas} nuevo(s)).`;
    if (!r.tareaIA) return base;
    // La IA sigue después de responder: la persona puede salir de la página
    after(r.tareaIA);
    return `${base} La IA está revisando el expediente en segundo plano; puede salir y volver más tarde.`;
  }, `/expedientes/${expedienteId}`);
}

export async function accionResolverObservacion(expedienteId: string, _: Resultado, f: FormData): Promise<Resultado> {
  const s = await requerirSesion();
  const decision = String(f.get('decision')) as 'CORREGIDA' | 'JUSTIFICADA' | 'DESCARTADA';
  return ejecutar(() => resolverObservacion(s, String(f.get('observacionId')), decision, String(f.get('justificacion') ?? ''), f.get('falsaAlarma') === 'on').then(() => 'Observación resuelta.'), `/expedientes/${expedienteId}`);
}

export async function accionProponerCorrecciones(expedienteId: string, observacionIds: string[]): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => {
    const r = await proponerCorrecciones(s, expedienteId, observacionIds);
    // La IA sigue después de responder: la persona puede salir de la página
    after(r.tarea);
    return `La IA está preparando las correcciones de ${r.observaciones} observación(es) en segundo plano; aparecerán aquí al terminar.`;
  }, `/expedientes/${expedienteId}`);
}

export async function accionAplicarCorrecciones(expedienteId: string, analisisId: string, indices: number[]): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => {
    const r = await aplicarCorrecciones(s, expedienteId, analisisId, indices);
    if (!r.aplicadas && !r.omitidas.length) return 'Propuesta descartada: no se cambió ningún dato.';
    const omitidas = r.omitidas.length ? ` No se aplicaron ${r.omitidas.length} porque el dato cambió después de la propuesta: ${r.omitidas.join(', ')}.` : '';
    const errores = r.errores ? ` Quedan ${r.errores} dato(s) por completar o corregir en el asistente.` : '';
    return `${r.aplicadas} cambio(s) aplicado(s) y reglas ejecutadas de nuevo.${omitidas}${errores}`;
  }, `/expedientes/${expedienteId}`);
}

export async function accionGenerarBorrador(expedienteId: string): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => {
    const r = await generarBorradorExpediente(s, expedienteId);
    return `Borrador versión ${r.borrador.version} generado sobre las plantillas aprobadas.${r.avisoPdf ? ` ${r.avisoPdf}` : ''}`;
  }, `/expedientes/${expedienteId}`);
}

export async function accionFlujo(expedienteId: string, _: Resultado, f: FormData): Promise<Resultado> {
  const s = await requerirSesion();
  const accion = String(f.get('accion'));
  return ejecutar(async () => {
    switch (accion) {
      case 'enviar': await enviarARevision(s, expedienteId); return 'Enviado a revisión.';
      case 'aprobar': await aprobarExpediente(s, expedienteId); return 'Aprobado: queda listo para la firma del notario.';
      case 'devolver': await devolverExpediente(s, expedienteId, String(f.get('comentario') ?? '')); return 'Devuelto al responsable con comentarios.';
      case 'firmar': await marcarFirmada(s, expedienteId, Number(f.get('numeroEscritura'))); return 'Marcada como firmada.';
      case 'archivar': await archivarExpediente(s, expedienteId); return 'Archivado.';
      case 'reabrir': await reabrirExpediente(s, expedienteId, String(f.get('motivo') ?? '')); return 'Reabierto.';
      case 'reasignar': await reasignarExpediente(s, expedienteId, String(f.get('usuarioId') ?? '')); return 'Reasignado.';
      default: throw new ErrorNegocio('Acción no válida.');
    }
  }, `/expedientes/${expedienteId}`);
}

export async function accionEliminarDocumento(expedienteId: string, documentoId: string): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(() => eliminarDocumento(s, documentoId).then(() => 'Documento retirado. Cargue el documento correcto y vuelva a ejecutar el asistente.'), `/expedientes/${expedienteId}`);
}

export async function accionIniciarAsistente(expedienteId: string): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => {
    const r = await iniciarAsistente(s, expedienteId);
    // La IA sigue después de responder: la persona puede salir de la página
    after(r.tarea);
    return `El asistente está analizando ${r.documentos} documento(s) en segundo plano; las preguntas aparecerán aquí al terminar.`;
  }, `/expedientes/${expedienteId}`);
}

export async function accionResponderAsistente(expedienteId: string, analisisId: string, respuestas: RespuestasAsistente): Promise<Resultado & { erroresPreguntas?: Record<string, string> }> {
  const s = await requerirSesion();
  let erroresPreguntas: Record<string, string> | undefined;
  const r = await ejecutar(async () => {
    const x = await responderAsistente(s, expedienteId, analisisId, respuestas);
    erroresPreguntas = x.errores;
    const errores = Object.keys(x.errores).length;
    if (errores && !x.respondidas) throw new ErrorNegocio(`Revise ${errores} respuesta(s) marcada(s).`);
    const base = `${x.respondidas} respuesta(s) guardada(s).`;
    if (errores) return `${base} Revise ${errores} respuesta(s) marcada(s).`;
    if (x.obligatoriasPendientes) return `${base} Faltan ${x.obligatoriasPendientes} dato(s) obligatorio(s).`;
    if (x.pendientes) return `${base} Quedan ${x.pendientes} pregunta(s) opcional(es); puede responderlas u omitirlas.`;
    return `${base} Ya puede generar la escritura en Word.`;
  }, `/expedientes/${expedienteId}`);
  return { ...r, erroresPreguntas };
}

export async function accionContinuarConDatos(expedienteId: string, observacionIds: string[]): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(async () => {
    const n = await continuarConDatos(s, expedienteId, observacionIds);
    return `Se continúa con los datos actuales: ${n} inconsistencia(s) quedan registradas como aceptadas para el revisor.`;
  }, `/expedientes/${expedienteId}`);
}

/**
 * Pide al asistente una pregunta para corregir o completar un dato (desde la revisión de los datos,
 * una respuesta ya dada o una observación) y lleva al usuario a las preguntas.
 */
export async function accionCorregirDato(expedienteId: string, ruta: string, motivo?: string): Promise<Resultado> {
  const s = await requerirSesion();
  const r = await ejecutar(() => agregarPregunta(s, expedienteId, ruta, motivo), `/expedientes/${expedienteId}`);
  if (r.error) return r;
  redirect(`/expedientes/${expedienteId}/asistente#preguntas`);
}
