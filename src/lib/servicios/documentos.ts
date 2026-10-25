/**
 * Documentos soporte: carga (cifrada), análisis con IA y descarga auditada.
 */
import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { guardarCifrado, leerCifrado, borrarCifrado } from '../almacenamiento';
import { sha256 } from '../seguridad/cifrado';
import { consumirLimite } from '../seguridad/limites';
import { TIPOS_DOCUMENTALES, esquemaExtraccion, normalizarExtraccion, type TipoDocumental, type ResultadoExtraccion } from '../ia/documentos';
import { SISTEMA_EXTRACCION, VERSION_INSTRUCCIONES_BASE } from '../ia/instrucciones';
import { llamarEstructurado, bloqueDocumento, ErrorIA } from '../ia/cliente';
import { sugerenciasDesdeHechos } from '../ia/sugerencias';
import { obtenerExpediente, puedeEditar, ErrorNegocio } from './expedientes';

/** Tamaño máximo por archivo. En Vercel debe ser 4 (límite de 4,5 MB por petición). */
export const LIMITE_CARGA_MB = Math.min(25, Number(process.env.LIMITE_CARGA_MB) || 25);
const TAMANO_MAXIMO = LIMITE_CARGA_MB * 1024 * 1024;

/** Tipo real del archivo por su firma (no se confía en la extensión ni en el tipo declarado) */
export function tipoPorFirma(b: Buffer): string | null {
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export async function subirDocumento(s: SesionActiva, expedienteId: string, archivo: File, tipo: string) {
  const e = await obtenerExpediente(s, expedienteId);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('No se pueden cargar documentos en el estado actual del expediente.');
  // AUTO: la IA identifica el documento al analizarlo (se guarda como OTRO hasta entonces)
  if (tipo === 'AUTO') tipo = 'OTRO';
  if (!(tipo in TIPOS_DOCUMENTALES)) throw new ErrorNegocio('Tipo de documento no válido.');
  if (!(await consumirLimite(`carga:${s.usuario.id}`, 60, 3600)).permitido) throw new ErrorNegocio('Demasiadas cargas en la última hora.');
  if (archivo.size === 0 || archivo.size > TAMANO_MAXIMO) throw new ErrorNegocio(`El archivo debe pesar entre 1 byte y ${LIMITE_CARGA_MB} MB.`);
  const bytes = Buffer.from(await archivo.arrayBuffer());
  const mime = tipoPorFirma(bytes);
  if (!mime) throw new ErrorNegocio('Solo se aceptan PDF o imágenes (JPG, PNG, WEBP).');
  const ruta = await guardarCifrado(bytes, 'documentos');
  const nombre = archivo.name.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 150);
  const d = await db.documento.create({
    data: { expedienteId, tipoDocumental: tipo, nombreOriginal: nombre, mime, tamano: bytes.length, hashSha256: sha256(bytes), rutaCifrada: ruta, subidoPorId: s.usuario.id },
  });
  await auditar({ ...datosAuditoria(s), accion: 'DOCUMENTO_CARGADO', entidad: 'documento', entidadId: d.id, detalle: { expedienteId, tipo, tamano: bytes.length, sha256: d.hashSha256 } });
  return d;
}

/** Instrucciones adicionales aprobadas por el administrador (entrenamiento) para la extracción */
async function instruccionesAprobadas(proposito: 'EXTRACCION' | 'REVISION', tipoIds: string[]) {
  const filas = await db.instruccionIA.findMany({ where: { proposito, estado: 'APROBADA', OR: [{ tipoId: null }, { tipoId: { in: tipoIds } }] }, orderBy: [{ tipoId: 'asc' }, { version: 'desc' }] });
  // la versión aprobada más reciente por tipo
  const vistas = new Set<string>();
  const vigentes = filas.filter((f) => { const k = f.tipoId ?? '*'; if (vistas.has(k)) return false; vistas.add(k); return true; });
  return { texto: vigentes.map((f) => f.contenido).join('\n\n'), version: [VERSION_INSTRUCCIONES_BASE, ...vigentes.map((f) => `${f.tipoId ?? 'general'}-v${f.version}`)].join('+') };
}

export async function analizarDocumento(s: SesionActiva, documentoId: string) {
  const doc = await db.documento.findUniqueOrThrow({ where: { id: documentoId } });
  const e = await obtenerExpediente(s, doc.expedienteId);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('El expediente no se puede modificar en su estado actual.');
  if (doc.estadoAnalisis === 'EN_CURSO') throw new ErrorNegocio('El documento ya se está analizando.');
  if (!(await consumirLimite(`ia:${s.usuario.id}`, 100, 3600)).permitido) throw new ErrorNegocio('Límite de análisis por hora alcanzado.');
  let tipo = doc.tipoDocumental as TipoDocumental;
  const instr = await instruccionesAprobadas('EXTRACCION', Array.isArray(e.actos) ? (e.actos as string[]) : []);
  await db.documento.update({ where: { id: doc.id }, data: { estadoAnalisis: 'EN_CURSO' } });
  const analisis = await db.analisisIA.create({ data: { expedienteId: e.id, proposito: 'EXTRACCION', modelo: process.env.CLAUDE_MODELO_EXTRACCION || 'claude-opus-5-5', estado: 'EN_CURSO', documentoId: doc.id, versionInstruccion: instr.version } });
  try {
    const bytes = await leerCifrado(doc.rutaCifrada);
    const extraer = (t: TipoDocumental) => llamarEstructurado<ResultadoExtraccion>({
      proposito: 'EXTRACCION',
      sistema: SISTEMA_EXTRACCION + (instr.texto ? `\n\nInstrucciones adicionales aprobadas por la notaría:\n${instr.texto}` : ''),
      contenido: [
        bloqueDocumento(bytes, doc.mime, `${TIPOS_DOCUMENTALES[t]} – ${doc.nombreOriginal}`),
        { type: 'text', text: t === 'OTRO'
          ? 'El usuario no indicó qué documento es. Identifícalo en tipo_detectado y extrae los datos relevantes.'
          : `Tipo de documento declarado por el usuario: ${t} (${TIPOS_DOCUMENTALES[t]}). Extrae los datos según el esquema.` },
      ],
      esquema: esquemaExtraccion(t),
    }).then((x) => ({ ...x, datos: normalizarExtraccion(t, x.datos) }));
    let r = await extraer(tipo);
    const consumo = { tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, tokensCacheLectura: r.tokensCacheLectura, duracionMs: r.duracionMs };
    // Si la IA reconoce otro tipo de documento, se extrae de nuevo con el esquema que le corresponde
    const detectado = r.datos.tipo_detectado;
    if (detectado && detectado !== tipo && detectado !== 'OTRO' && detectado in TIPOS_DOCUMENTALES) {
      tipo = detectado;
      r = await extraer(tipo);
      consumo.tokensEntrada += r.tokensEntrada; consumo.tokensSalida += r.tokensSalida; consumo.tokensCacheLectura += r.tokensCacheLectura; consumo.duracionMs += r.duracionMs;
    }
    const sugerencias = sugerenciasDesdeHechos(tipo, r.datos);
    await db.$transaction([
      db.documento.update({ where: { id: doc.id }, data: { estadoAnalisis: 'COMPLETADO', tipoDocumental: tipo, hechos: r.datos as unknown as Prisma.InputJsonValue } }),
      db.analisisIA.update({ where: { id: analisis.id }, data: { estado: 'COMPLETADO', modelo: r.modelo, ...consumo } }),
      // Sugerencias anteriores del mismo documento que nadie tocó se reemplazan
      db.datoExtraido.deleteMany({ where: { documentoId: doc.id, estado: 'PENDIENTE' } }),
      db.datoExtraido.createMany({
        data: sugerencias.map((x) => ({
          expedienteId: e.id, analisisId: analisis.id, documentoId: doc.id, campo: x.campo, valor: x.valor as Prisma.InputJsonValue,
          pagina: x.pagina, fragmento: x.fragmento?.slice(0, 1000) ?? null, confianza: x.confianza, revisionManual: x.revisionManual,
        })),
      }),
    ]);
    await auditar({ ...datosAuditoria(s), accion: 'DOCUMENTO_ANALIZADO', entidad: 'documento', entidadId: doc.id, detalle: { sugerencias: sugerencias.length, revisionManual: sugerencias.filter((x) => x.revisionManual).length, modelo: r.modelo } });
    return { sugerencias: sugerencias.length };
  } catch (err) {
    const mensaje = err instanceof ErrorIA ? err.message : 'Error inesperado al analizar el documento.';
    await db.documento.update({ where: { id: doc.id }, data: { estadoAnalisis: 'ERROR' } });
    await db.analisisIA.update({ where: { id: analisis.id }, data: { estado: 'ERROR', error: mensaje } });
    await auditar({ ...datosAuditoria(s), accion: 'ANALISIS_FALLIDO', entidad: 'documento', entidadId: doc.id, detalle: { error: mensaje } });
    if (!(err instanceof ErrorIA)) console.error('[analizarDocumento]', err);
    throw new ErrorNegocio(mensaje);
  }
}

/**
 * Retira un documento mientras el expediente está en elaboración (p. ej. para recargarlo cuando el
 * asistente advierte que está incompleto o no corresponde). Sus sugerencias sin decidir se eliminan;
 * los datos ya aplicados al formulario se conservan. La auditoría guarda el hash del archivo retirado.
 */
export async function eliminarDocumento(s: SesionActiva, documentoId: string) {
  const doc = await db.documento.findUniqueOrThrow({ where: { id: documentoId } });
  const e = await obtenerExpediente(s, doc.expedienteId);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('No se pueden retirar documentos en el estado actual del expediente.');
  if (doc.estadoAnalisis === 'EN_CURSO') throw new ErrorNegocio('El documento se está analizando; espere a que termine.');
  await db.$transaction([
    db.datoExtraido.deleteMany({ where: { documentoId: doc.id, estado: 'PENDIENTE' } }),
    db.datoExtraido.updateMany({ where: { documentoId: doc.id }, data: { documentoId: null } }),
    db.documento.delete({ where: { id: doc.id } }),
  ]);
  await borrarCifrado(doc.rutaCifrada).catch((err) => console.error('[eliminarDocumento]', err));
  await auditar({ ...datosAuditoria(s), accion: 'DOCUMENTO_RETIRADO', entidad: 'documento', entidadId: doc.id, detalle: { expedienteId: doc.expedienteId, tipo: doc.tipoDocumental, sha256: doc.hashSha256 } });
}

/** Descarga individual (siempre auditada); no existe exportación masiva */
export async function descargarDocumento(s: SesionActiva, documentoId: string) {
  const doc = await db.documento.findUniqueOrThrow({ where: { id: documentoId } });
  await obtenerExpediente(s, doc.expedienteId); // verifica permiso
  const bytes = await leerCifrado(doc.rutaCifrada);
  if (sha256(bytes) !== doc.hashSha256) throw new ErrorNegocio('El documento no pasó la verificación de integridad.');
  await auditar({ ...datosAuditoria(s), accion: 'DOCUMENTO_DESCARGADO', entidad: 'documento', entidadId: doc.id, detalle: { expedienteId: doc.expedienteId } });
  return { bytes, mime: doc.mime, nombre: doc.nombreOriginal };
}

export { instruccionesAprobadas };
