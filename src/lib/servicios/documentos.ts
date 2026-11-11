/**
 * Documentos soporte de la escritura: carga (cifrada), lectura con IA y descarga auditada.
 *
 * Cada documento se lee UNA sola vez con Haiku (muy económico) y lo leído se guarda: generar la
 * escritura otra vez (con otras observaciones u otra plantilla) no vuelve a pagar la lectura. La
 * lectura empieza apenas se carga el documento, en segundo plano, y la generación espera a los que
 * falten. Un PDF de más de 90 páginas se lee por tramos.
 */
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { guardarCifrado, leerCifrado, borrarCifrado, guardarParte, unirPartes } from '../almacenamiento';
import { sha256 } from '../seguridad/cifrado';
import { consumirLimite } from '../seguridad/limites';
import { abrirPdf, extraerPaginas } from '../pdf';
import { textoDocx, ErrorDocx } from '../escritura/docx';
import { llamarEstructurado, prepararDocumento, ErrorIA } from '../ia/cliente';
import { rescatarArreglo } from '../ia/json';
import { SISTEMA_LECTURA, ESQUEMA_LECTURA, type Lectura, type DocumentoLeido } from '../ia/instrucciones';
import { expedienteEditable, obtenerExpediente, ErrorNegocio } from './expedientes';

/** El navegador envía cada archivo en partes (Vercel limita cada petición a 4,5 MB) */
const TAMANO_MAXIMO_PARTE = 4 * 1024 * 1024;
/** Páginas de PDF por llamada (la API admite 100) */
const PAGINAS_POR_TRAMO = 90;
/** Una lectura «en curso» que no avanza en este tiempo se cortó y se puede repetir */
export const LECTURA_CORTADA_MS = 6 * 60_000;
/** Texto máximo de un documento de Word que se envía a leer */
const MAXIMO_TEXTO = 150_000;

export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Tipo real del archivo por su firma (no se confía en la extensión ni en el tipo declarado) */
export function tipoPorFirma(b: Buffer): string | null {
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && b.includes(Buffer.from('word/'))) return MIME_DOCX;
  return null;
}

/** Las partes de una carga quedan atadas al usuario y al expediente: otro no puede completarla */
function claveCarga(s: SesionActiva, expedienteId: string, carga: string): string {
  if (!/^[0-9a-f-]{36}$/.test(carga)) throw new ErrorNegocio('Carga no válida.');
  return sha256(`${s.usuario.id}:${expedienteId}:${carga}`).slice(0, 32);
}

export async function subirParteDocumento(s: SesionActiva, expedienteId: string, carga: string, indice: number, parte: File) {
  await expedienteEditable(s, expedienteId);
  if (!parte.size || parte.size > TAMANO_MAXIMO_PARTE) throw new ErrorNegocio('Parte de archivo no válida.');
  await guardarParte(claveCarga(s, expedienteId, carga), indice, Buffer.from(await parte.arrayBuffer()));
}

/** Une las partes recibidas y registra el documento (pendiente de lectura). Devuelve su id. */
export async function completarDocumento(s: SesionActiva, expedienteId: string, carga: string, partes: number, nombre: string): Promise<string> {
  if (!Number.isInteger(partes) || partes < 1 || partes > 99_999) throw new ErrorNegocio('Carga no válida.');
  await expedienteEditable(s, expedienteId);
  let bytes: Buffer;
  try {
    bytes = await unirPartes(claveCarga(s, expedienteId, carga), partes);
  } catch (e) {
    if (e instanceof ErrorNegocio) throw e;
    console.error('[completarDocumento]', e);
    throw new ErrorNegocio('No llegaron todas las partes del archivo. Cárguelo de nuevo.');
  }
  if (!(await consumirLimite(`carga:${s.usuario.id}`, 120, 3600)).permitido) throw new ErrorNegocio('Demasiadas cargas en la última hora.');
  if (!bytes.length) throw new ErrorNegocio('El archivo está vacío.');
  const mime = tipoPorFirma(bytes);
  if (!mime) throw new ErrorNegocio('Solo se aceptan PDF, imágenes (JPG, PNG, WEBP) o documentos de Word (.docx).');
  const paginas = mime === 'application/pdf' ? (await abrirPdf(bytes))?.getPageCount() ?? null : 1;
  const ruta = await guardarCifrado(bytes, 'documentos');
  const d = await db.documento.create({
    data: {
      expedienteId, nombreOriginal: nombre.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 150), mime, tamano: bytes.length, paginas,
      hashSha256: sha256(bytes), rutaCifrada: ruta, subidoPorId: s.usuario.id,
    },
  });
  await auditar({ ...datosAuditoria(s), accion: 'DOCUMENTO_CARGADO', entidad: 'documento', entidadId: d.id, detalle: { expedienteId, tamano: bytes.length, sha256: d.hashSha256 } });
  return d.id;
}

/** Bloques de contenido de un archivo para la IA (un PDF largo, por tramos de páginas) */
export async function bloquesDeArchivo(bytes: Buffer, mime: string, titulo: string): Promise<{ tramos: { bloque: Anthropic.Beta.BetaContentBlockParam; desde: number }[]; liberar: () => Promise<void> }> {
  if (mime === MIME_DOCX) {
    let texto: string;
    try { texto = textoDocx(bytes); } catch (e) { if (e instanceof ErrorDocx) throw new ErrorIA('El documento de Word no se pudo abrir.', 'FORMATO'); throw e; }
    return { tramos: [{ bloque: { type: 'text', text: `<documento nombre="${titulo.replace(/"/g, "'")}">\n${texto.slice(0, MAXIMO_TEXTO)}\n</documento>` }, desde: 1 }], liberar: async () => {} };
  }
  const pdf = mime === 'application/pdf' ? await abrirPdf(bytes) : null;
  const paginas = pdf?.getPageCount() ?? 1;
  const partes = !pdf || paginas <= PAGINAS_POR_TRAMO
    ? [{ bytes, desde: 1 }]
    : await Promise.all(Array.from({ length: Math.ceil(paginas / PAGINAS_POR_TRAMO) }, async (_, i) => ({
      bytes: await extraerPaginas(pdf, i * PAGINAS_POR_TRAMO + 1, Math.min(paginas, (i + 1) * PAGINAS_POR_TRAMO)),
      desde: i * PAGINAS_POR_TRAMO + 1,
    })));
  const liberar: (() => Promise<void>)[] = [];
  const tramos = [];
  for (const p of partes) {
    const d = await prepararDocumento(p.bytes, mime, titulo);
    liberar.push(d.liberar);
    tramos.push({ bloque: d.bloque, desde: p.desde });
  }
  return { tramos, liberar: async () => { await Promise.all(liberar.map((f) => f())); } };
}

/**
 * Lee un documento con la IA y guarda lo leído. Toma el documento solo si nadie lo está leyendo (o si
 * su lectura se cortó); devuelve false si otro ya lo tomó. Un error queda en el documento (ERROR).
 */
export async function leerDocumento(documentoId: string, usuarioId: string): Promise<boolean> {
  const tomado = await db.documento.updateMany({
    where: { id: documentoId, OR: [{ estadoLectura: { in: ['PENDIENTE', 'ERROR'] } }, { estadoLectura: 'EN_CURSO', actualizadoEn: { lt: new Date(Date.now() - LECTURA_CORTADA_MS) } }] },
    data: { estadoLectura: 'EN_CURSO', errorLectura: null },
  });
  if (!tomado.count) return false;
  const doc = await db.documento.findUniqueOrThrow({ where: { id: documentoId } });
  let liberar = async () => {};
  try {
    const bytes = await leerCifrado(doc.rutaCifrada);
    const archivo = await bloquesDeArchivo(bytes, doc.mime, doc.nombreOriginal);
    liberar = archivo.liberar;
    const documentos: DocumentoLeido[] = [];
    for (const t of archivo.tramos) {
      const desplazar = (x: DocumentoLeido): DocumentoLeido => (t.desde === 1 ? x : {
        ...x,
        paginas: x.paginas.replace(/\d+/g, (n) => String(Number(n) + t.desde - 1)),
        datos: x.datos.map((d) => ({ ...d, pagina: d.pagina ? d.pagina + t.desde - 1 : d.pagina })),
        textos_literales: x.textos_literales.map((d) => ({ ...d, pagina: d.pagina ? d.pagina + t.desde - 1 : d.pagina })),
      });
      try {
        const r = await llamarEstructurado<Lectura>({
          proposito: 'LECTURA',
          registro: { usuarioId, expedienteId: doc.expedienteId },
          sistema: SISTEMA_LECTURA,
          contenido: [t.bloque, { type: 'text', text: archivo.tramos.length > 1 ? `Este tramo empieza en la página ${t.desde} del archivo: numera las páginas desde 1 dentro del tramo.` : 'Transcribe los datos de este archivo.' }],
          esquema: ESQUEMA_LECTURA as unknown as Record<string, unknown>,
          maxTokens: 32000,
        });
        documentos.push(...(r.datos.documentos ?? []).map(desplazar));
      } catch (e) {
        // Cortada por longitud: se conservan los documentos que alcanzaron a salir completos
        if (!(e instanceof ErrorIA) || e.codigo !== 'TRUNCADO' || !e.parcial) throw e;
        const rescatados = rescatarArreglo<DocumentoLeido>(e.parcial, 'documentos');
        if (!rescatados.length) throw e;
        documentos.push(...rescatados.map(desplazar));
      }
    }
    await db.documento.update({ where: { id: doc.id }, data: { estadoLectura: 'LEIDO', lectura: { documentos } as unknown as Prisma.InputJsonValue } });
    return true;
  } catch (e) {
    const mensaje = e instanceof ErrorIA ? e.message : 'Error inesperado al leer el documento.';
    if (!(e instanceof ErrorIA)) console.error('[leerDocumento]', e);
    await db.documento.update({ where: { id: doc.id }, data: { estadoLectura: 'ERROR', errorLectura: mensaje } });
    return true;
  } finally {
    await liberar();
  }
}

/** Vuelve a leer un documento (p. ej. si la lectura falló) */
export async function releerDocumento(s: SesionActiva, documentoId: string) {
  const doc = await db.documento.findUniqueOrThrow({ where: { id: documentoId }, select: { expedienteId: true, estadoLectura: true, actualizadoEn: true } });
  await expedienteEditable(s, doc.expedienteId);
  if (!process.env.ANTHROPIC_API_KEY) throw new ErrorNegocio('La IA no está configurada en el servidor.');
  if (doc.estadoLectura === 'EN_CURSO' && Date.now() - doc.actualizadoEn.getTime() < LECTURA_CORTADA_MS) throw new ErrorNegocio('El documento se está leyendo.');
  if (!(await consumirLimite(`ia:${s.usuario.id}`, 200, 3600)).permitido) throw new ErrorNegocio('Límite de lecturas por hora alcanzado.');
  await db.documento.update({ where: { id: documentoId }, data: { estadoLectura: 'PENDIENTE', lectura: Prisma.DbNull } });
  return () => leerDocumento(documentoId, s.usuario.id).then(() => undefined);
}

export async function eliminarDocumento(s: SesionActiva, documentoId: string) {
  const doc = await db.documento.findUniqueOrThrow({ where: { id: documentoId } });
  await expedienteEditable(s, doc.expedienteId);
  await db.documento.delete({ where: { id: doc.id } });
  await borrarCifrado(doc.rutaCifrada).catch((err) => console.error('[eliminarDocumento]', err));
  await auditar({ ...datosAuditoria(s), accion: 'DOCUMENTO_RETIRADO', entidad: 'documento', entidadId: doc.id, detalle: { expedienteId: doc.expedienteId, sha256: doc.hashSha256 } });
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
