/**
 * Borradores de la escritura: la IA los redacta sobre las plantillas aprobadas
 * (src/lib/servicios/redaccion.ts); aquí se descargan y se lee su texto. Se guardan cifrados
 * (Word y PDF) y versionados.
 */
import 'server-only';
import type { Borrador } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { leerCifrado } from '../almacenamiento';
import { sha256 } from '../seguridad/cifrado';
import { vistaPreviaDocx, textoDeParrafos } from '../escritura/vista-previa';
import { obtenerExpediente, ErrorNegocio } from './expedientes';

/** Texto plano de un borrador (para las reglas y la revisión de la IA) */
export async function textoDeBorrador(b: Pick<Borrador, 'rutaDocxCifrada'>): Promise<string> {
  return textoDeParrafos(vistaPreviaDocx(await leerCifrado(b.rutaDocxCifrada))).replace(/-{4,}/g, '').replace(/[ \t]+\n/g, '\n');
}

/** Texto del último borrador del expediente; null si aún no hay */
export async function textoUltimoBorrador(expedienteId: string): Promise<string | null> {
  const b = await db.borrador.findFirst({ where: { expedienteId }, orderBy: { version: 'desc' } });
  return b ? textoDeBorrador(b) : null;
}

/** Descarga individual auditada de un borrador */
/** `vista`: para el visor de la página del borrador (se audita como visualización, no como descarga) */
export async function descargarBorrador(s: SesionActiva, borradorId: string, formato: 'docx' | 'pdf', vista = false) {
  const b = await db.borrador.findUniqueOrThrow({ where: { id: borradorId } });
  const e = await obtenerExpediente(s, b.expedienteId);
  const ruta = formato === 'pdf' ? b.rutaPdfCifrada : b.rutaDocxCifrada;
  if (!ruta) throw new ErrorNegocio('Este borrador no tiene versión PDF.');
  const bytes = await leerCifrado(ruta);
  if (formato === 'docx' && sha256(bytes) !== b.hashSha256) throw new ErrorNegocio('El borrador no pasó la verificación de integridad.');
  await auditar({ ...datosAuditoria(s), accion: vista ? 'BORRADOR_VISUALIZADO' : 'BORRADOR_DESCARGADO', entidad: 'borrador', entidadId: b.id, detalle: { expedienteId: e.id, formato } });
  return {
    bytes,
    nombre: `${e.numeroInterno}-borrador-v${b.version}.${formato}`,
    mime: formato === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}
