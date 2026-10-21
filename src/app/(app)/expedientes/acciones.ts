'use server';
/**
 * Acciones de los expedientes. Cada una valida la sesión y los permisos en el servidor;
 * el navegador nunca decide qué está permitido.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requerirSesion } from '@/lib/sesion';
import {
  crearExpediente, guardarPaso, aplicarSugerencia, descartarSugerencia, enviarARevision, aprobarExpediente,
  devolverExpediente, marcarFirmada, archivarExpediente, reabrirExpediente, reasignarExpediente, ErrorNegocio, type ActualizacionPaso,
} from '@/lib/servicios/expedientes';
import { subirDocumento, analizarDocumento } from '@/lib/servicios/documentos';
import { ejecutarRevision, resolverObservacion } from '@/lib/servicios/revision';
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

export async function accionGuardarPaso(id: string, act: ActualizacionPaso): Promise<Resultado> {
  const s = await requerirSesion();
  try {
    const { errores } = await guardarPaso(s, id, act);
    revalidatePath(`/expedientes/${id}`, 'layout');
    return Object.keys(errores).length ? { errores, error: 'Se guardó, pero hay datos por completar o corregir.' } : { ok: 'Guardado.' };
  } catch (e) {
    if (e instanceof ErrorNegocio) return { error: e.message };
    console.error('[guardarPaso]', e);
    return { error: 'No se pudo guardar.' };
  }
}

export async function accionAplicarSugerencia(expedienteId: string, datoId: string): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(() => aplicarSugerencia(s, datoId).then(() => 'Sugerencia aplicada.'), `/expedientes/${expedienteId}`);
}

export async function accionDescartarSugerencia(expedienteId: string, datoId: string, motivo: string): Promise<Resultado> {
  const s = await requerirSesion();
  return ejecutar(() => descartarSugerencia(s, datoId, motivo).then(() => 'Sugerencia descartada.'), `/expedientes/${expedienteId}`);
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
    const base = `Revisión ejecutada: ${r.hallazgos} hallazgo(s) de las reglas (${r.nuevasReglas} nuevo(s))${conIA ? `, ${r.nuevasIA} observación(es) de la IA` : ''}.`;
    if (r.errorIA) throw new ErrorNegocio(`${base} La revisión de la IA no se completó: ${r.errorIA}`);
    return base;
  }, `/expedientes/${expedienteId}`);
}

export async function accionResolverObservacion(expedienteId: string, _: Resultado, f: FormData): Promise<Resultado> {
  const s = await requerirSesion();
  const decision = String(f.get('decision')) as 'CORREGIDA' | 'JUSTIFICADA' | 'DESCARTADA';
  return ejecutar(() => resolverObservacion(s, String(f.get('observacionId')), decision, String(f.get('justificacion') ?? ''), f.get('falsaAlarma') === 'on').then(() => 'Observación resuelta.'), `/expedientes/${expedienteId}`);
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
