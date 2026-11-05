/**
 * Carga de una versión de plantilla, de principio a fin:
 *   1. Valida el .docx.
 *   2. Guarda la versión, pendiente de aprobación, y la audita.
 *   3. La verificación automática (revision-plantillas.ts). La revisión de la IA no corre al cargar:
 *      se pide después desde la versión.
 * La plantilla es el modelo de redacción del tipo de escritura: se guarda tal como viene (puede ser
 * una escritura real de la notaría). No se convierte en variables: la IA la toma como base para
 * redactar cada caso y nunca copia los datos del caso del modelo.
 * La usan la carga de una versión (acción) y la de varias a la vez (api/plantillas/cargar).
 */
import 'server-only';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { cargarPlantilla, validarDocxPlantilla, ErrorPlantilla } from './plantillas';
import { revisarPlantilla } from './revision-plantillas';

export interface ResultadoCarga {
  id: string;
  version: number;
  tipo: string;
}

export async function cargarYRevisarPlantilla(s: SesionActiva, entrada: { tipoId: string; nombreArchivo: string; archivo: Buffer; notas?: string }): Promise<ResultadoCarga> {
  const tipo = await db.tipoEscritura.findUnique({ where: { id: entrada.tipoId } });
  if (!tipo) throw new ErrorPlantilla('Tipo de escritura no válido.');
  const v = validarDocxPlantilla(entrada.archivo);
  if (!v.ok) throw new ErrorPlantilla(v.error);
  const p = await cargarPlantilla(tipo.id, entrada.nombreArchivo, entrada.archivo, s.usuario.id, entrada.notas);
  await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_CARGADA', entidad: 'plantilla', entidadId: p.id, detalle: { tipoId: tipo.id, version: p.version, sha256: p.hashSha256 } });
  await revisarPlantilla(p.id, s, false).catch((e) => { console.error('[carga-plantillas] verificación', e); return null; });
  return { id: p.id, version: p.version, tipo: tipo.nombre };
}
