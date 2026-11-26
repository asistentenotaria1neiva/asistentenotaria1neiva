/**
 * Vigilancia de una escritura con procesos en segundo plano: reanuda la generación que se cortó,
 * cierra la que venció y vuelve a leer los documentos trabados. La usan la página de la escritura y
 * su consulta liviana de estado (api/expedientes/[id]/estado), que la página abierta pide cada pocos
 * segundos en lugar de volver a armarse completa: así la transferencia de Vercel se mantiene baja.
 */
import 'server-only';
import { after } from 'next/server';
import { db } from '@/lib/db';
import type { SesionActiva } from '@/lib/sesion-tipos';
import { generacionEnCurso, generacionPorReanudar } from './generacion';
import { leerDocumento, LECTURA_CORTADA_MS } from './documentos';
import { urlAplicacion } from '@/lib/seguridad/red';

/** Debe llamarse después de verificar el permiso sobre la escritura */
export async function vigilarExpediente(s: SesionActiva, id: string, editable: boolean) {
  // Una etapa de la generación que se cortó se reanuda; un documento cuya lectura no empezó o se cortó, se lee
  const reanudar = await generacionPorReanudar(id);
  if (reanudar) after(() => reanudar().catch((err) => console.error('[reanudar generación]', err)));
  // Primero la generación en curso: si pasó el tiempo máximo la cierra con error, y la lista de
  // versiones (que se lee después) ya la muestra con su error y no como «Generando»
  const enCurso = await generacionEnCurso(id);
  // Solo los campos del estado: lo leído por la IA (decenas de KB por documento) no se trae en cada consulta
  const documentos = await db.documento.findMany({ where: { expedienteId: id }, orderBy: { creadoEn: 'asc' }, select: { id: true, estadoLectura: true, creadoEn: true, actualizadoEn: true } });
  const trabados = documentos.filter((d) => (d.estadoLectura === 'PENDIENTE' && Date.now() - d.creadoEn.getTime() > 60_000) || (d.estadoLectura === 'EN_CURSO' && Date.now() - d.actualizadoEn.getTime() > LECTURA_CORTADA_MS));
  if (editable && !enCurso && trabados.length && process.env.ANTHROPIC_API_KEY) {
    // Con el mismo inicio: si el primero agota el tiempo de esta invocación, los demás siguen en otra
    const base = await urlAplicacion();
    const inicio = Date.now();
    after(async () => { for (const d of trabados.slice(0, 3)) await leerDocumento(d.id, s.usuario.id, { base, inicio }).catch((err) => console.error('[leerDocumento]', err)); });
  }
  return { enCurso, documentos };
}

/**
 * Huella corta de lo que muestra la página mientras trabaja: si cambia (avance de la generación,
 * documento leído, versión terminada), la página se vuelve a pedir; si no, no se transfiere nada más.
 */
export function huellaEstado(
  enCurso: { version: number; porcentaje: number; detalle: string } | null,
  documentos: { id: string; estadoLectura: string }[],
  ultimaGeneracion: { id: string; estado: string } | undefined,
) {
  return [
    enCurso ? `${enCurso.version}:${enCurso.porcentaje}:${enCurso.detalle}` : '-',
    documentos.map((d) => `${d.id}:${d.estadoLectura}`).join(','),
    ultimaGeneracion ? `${ultimaGeneracion.id}:${ultimaGeneracion.estado}` : '-',
  ].join('|');
}
