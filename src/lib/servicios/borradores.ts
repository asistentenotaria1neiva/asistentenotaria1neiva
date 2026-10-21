/**
 * Generación del borrador (paso 6): solo con plantillas APROBADAS, sin observaciones
 * críticas abiertas y sin variables faltantes. Se guarda cifrado (Word y PDF) y versionado.
 */
import 'server-only';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { guardarCifrado, leerCifrado } from '../almacenamiento';
import { sha256 } from '../seguridad/cifrado';
import { prepararContexto } from '../escritura/contexto';
import { ErrorDatos } from '../escritura/personas';
import { generarBorrador, convertirAPdf } from '../escritura/generar';
import { obtenerConfig } from '../configuracion';
import { cargadorAprobadas, ErrorPlantilla } from './plantillas';
import { obtenerExpediente, puedeEditar, datosDe, actosDe, bloqueos, ErrorNegocio } from './expedientes';
import { ejecutarRevision } from './revision';

export async function generarBorradorExpediente(s: SesionActiva, expedienteId: string) {
  const e = await obtenerExpediente(s, expedienteId);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('El borrador solo se genera mientras el expediente está en elaboración.');
  // Las reglas fijas se ejecutan siempre antes de generar
  await ejecutarRevision(s, expedienteId, false);
  const b = await bloqueos(expedienteId);
  if (b.criticas.length) throw new ErrorNegocio(`No se puede generar el borrador: hay ${b.criticas.length} observación(es) CRÍTICA(S) abiertas.`);

  const usadas: { tipoId: string; version: number; id: string }[] = [];
  let resultado;
  try {
    const ctx = prepararContexto(datosDe(e), actosDe(e), await obtenerConfig('notaria'));
    resultado = await generarBorrador(ctx, cargadorAprobadas(usadas));
  } catch (err) {
    if (err instanceof ErrorDatos) throw new ErrorNegocio(err.message);
    if (err instanceof ErrorPlantilla) throw new ErrorNegocio(err.message);
    throw err;
  }
  if (resultado.faltantes.length) throw new ErrorNegocio(`La plantilla requiere datos sin diligenciar: ${resultado.faltantes.join(', ')}.`);

  let pdf: Buffer | null = null;
  let avisoPdf: string | undefined;
  try {
    pdf = await convertirAPdf(resultado.docx, `${e.numeroInterno}.docx`);
    if (!pdf) avisoPdf = 'El conversor PDF no está configurado; se generó solo el Word.';
  } catch (err) {
    avisoPdf = `No se pudo generar el PDF: ${(err as Error).message}`;
  }
  const ultima = await db.borrador.findFirst({ where: { expedienteId }, orderBy: { version: 'desc' } });
  const borrador = await db.borrador.create({
    data: {
      expedienteId, version: (ultima?.version ?? 0) + 1, plantillasUsadas: usadas, generadoPorId: s.usuario.id,
      rutaDocxCifrada: await guardarCifrado(resultado.docx, 'borradores'),
      rutaPdfCifrada: pdf ? await guardarCifrado(pdf, 'borradores') : null,
      hashSha256: sha256(resultado.docx),
    },
  });
  await auditar({ ...datosAuditoria(s), accion: 'BORRADOR_GENERADO', entidad: 'borrador', entidadId: borrador.id, detalle: { expedienteId, version: borrador.version, plantillas: usadas.map((u) => `${u.tipoId}@v${u.version}`), pdf: !!pdf } });
  return { borrador, avisoPdf };
}

/** Descarga individual auditada de un borrador */
export async function descargarBorrador(s: SesionActiva, borradorId: string, formato: 'docx' | 'pdf') {
  const b = await db.borrador.findUniqueOrThrow({ where: { id: borradorId } });
  const e = await obtenerExpediente(s, b.expedienteId);
  const ruta = formato === 'pdf' ? b.rutaPdfCifrada : b.rutaDocxCifrada;
  if (!ruta) throw new ErrorNegocio('Este borrador no tiene versión PDF.');
  const bytes = await leerCifrado(ruta);
  if (formato === 'docx' && sha256(bytes) !== b.hashSha256) throw new ErrorNegocio('El borrador no pasó la verificación de integridad.');
  await auditar({ ...datosAuditoria(s), accion: 'BORRADOR_DESCARGADO', entidad: 'borrador', entidadId: b.id, detalle: { expedienteId: e.id, formato } });
  return {
    bytes,
    nombre: `${e.numeroInterno}-borrador-v${b.version}.${formato}`,
    mime: formato === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
}
