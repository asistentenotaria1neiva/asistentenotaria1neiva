/**
 * Redacción de la escritura con IA (paso 6). Las plantillas aprobadas por el notario NO se llenan:
 * son el modelo de redacción de cada tipo de escritura. La IA escribe la escritura del caso tomando
 * ese modelo como base, con:
 *   - los datos del expediente (personas, inmuebles, escritura, actos) y los que calcula el sistema
 *     (comparecencias, valores en letras, notario, fecha en letras…: src/lib/escritura/contexto.ts);
 *   - lo que se leyó de los documentos soporte;
 *   - las respuestas del funcionario a las preguntas del asistente y sus indicaciones.
 * Lo que la IA no encuentra queda escrito «FALTA: …» y como observación CRÍTICA de las reglas (R12: debe resolverse antes de
 * enviar a revisión, redactando de nuevo). El Word se arma con el paquete de la plantilla base y el formato de la notaría
 * (src/lib/escritura/generar.ts), y se guarda cifrado y versionado como borrador.
 *
 * La redacción tarda (una escritura completa son miles de palabras): corre en segundo plano, como
 * la revisión de la IA, y la página muestra que está en curso.
 */
import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { guardarCifrado } from '../almacenamiento';
import { sha256 } from '../seguridad/cifrado';
import { prepararContexto, type ContextoEscritura } from '../escritura/contexto';
import { ErrorDatos } from '../escritura/personas';
import { ACTOS } from '../escritura/actos';
import { ESQUEMAS } from '../escritura/esquemas';
import { CAMPO_INDICACIONES } from '../escritura/actos-plantilla';
import { armarEscritura, convertirAPdf, type ParrafoRedactado } from '../escritura/generar';
import type { DatosExpediente } from '../escritura/tipos';
import { obtenerConfig } from '../configuracion';
import { llamarEstructurado, configuracionModelo, ErrorIA } from '../ia/cliente';
import { SISTEMA_REDACCION, ESQUEMA_REDACCION } from '../ia/instrucciones';
import { TIPOS_DOCUMENTALES, type TipoDocumental } from '../ia/documentos';
import { plantillaAprobada, ErrorPlantilla } from './plantillas';
import { textoDePlantilla } from './revision-plantillas';
import { obtenerExpediente, puedeEditar, datosDe, actosDe, bloqueos, ErrorNegocio } from './expedientes';
import { estadoAsistente, hechosParaAsistente, esAdicional } from './asistente';
import { instruccionesAprobadas } from './documentos';
import { ejecutarRevision } from './revision';
import { notificar } from './notificaciones';

/** Regla de las marcas «FALTA» en el texto del borrador (src/lib/reglas/reglas.ts) */
const CODIGO_BORRADOR_INCOMPLETO = 'R12-BORRADOR-INCOMPLETO';
/** Una redacción EN_CURSO más antigua que esto se da por interrumpida */
const LIMITE_REDACCION_MS = 15 * 60 * 1000;
const LIMITE_MODELO = 120_000; // caracteres de cada modelo enviados a la IA

interface RespuestaRedaccion {
  resumen: string;
  parrafos: ParrafoRedactado[];
  faltantes: { dato: string; motivo: string }[];
  advertencias: string[];
}

/** Lo que se guarda en el borrador sobre su redacción */
export interface InfoRedaccion {
  resumen: string;
  faltantes: { dato: string; motivo: string }[];
  advertencias: string[];
  modelo: string;
}

/** Redacción en curso del expediente, si la hay (una que lleva demasiado tiempo se da por interrumpida) */
export async function redaccionEnCurso(expedienteId: string) {
  const a = await db.analisisIA.findFirst({ where: { expedienteId, proposito: 'REDACCION', estado: 'EN_CURSO' }, orderBy: { creadoEn: 'desc' } });
  if (!a) return null;
  if (Date.now() - a.creadoEn.getTime() > LIMITE_REDACCION_MS) {
    await db.analisisIA.update({ where: { id: a.id }, data: { estado: 'ERROR', error: 'La redacción se interrumpió antes de terminar. Genérela de nuevo.' } });
    return null;
  }
  return a;
}

/** Última redacción (para mostrar su error si falló) */
export const ultimaRedaccion = (expedienteId: string) =>
  db.analisisIA.findFirst({ where: { expedienteId, proposito: 'REDACCION' }, orderBy: { creadoEn: 'desc' } });

/** Bloques (modelos) sobre los que se redacta, en el orden de la escritura */
function modelosDe(ctx: ContextoEscritura): string[] {
  if (!ctx.conCaratula) return ctx.actos.map((a) => a.plantilla);
  const anexos = [...new Set(ctx.actos.map((a) => a.anexo).filter((x): x is string => !!x))];
  return ['caratula', ...ctx.actos.map((a) => a.plantilla), 'cierre', ...anexos];
}

/** Una respuesta del asistente como texto (personas e inmuebles por su nombre) */
function textoRespuesta(v: unknown, datos: DatosExpediente): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.map((x) => textoRespuesta(x, datos)).join(', ');
  const p = datos.personas.find((x) => x.id === v);
  if (p) return `${p.nombre} (${p.tipo_documento} ${p.numero_documento})`;
  const i = datos.inmuebles.find((x) => x.id === v);
  if (i) return `inmueble ${i.matricula || i.direccion}`;
  return String(v);
}

/**
 * Valida que se pueda redactar y deja la redacción EN_CURSO. Devuelve `tarea`, que la acción
 * programa para después de responder (la persona puede salir de la página).
 */
export async function iniciarRedaccion(s: SesionActiva, expedienteId: string) {
  const e = await obtenerExpediente(s, expedienteId);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('La escritura solo se redacta mientras el expediente está en elaboración.');
  if (!process.env.ANTHROPIC_API_KEY) throw new ErrorNegocio('La IA no está configurada: sin ella no se puede redactar la escritura.');
  if (await redaccionEnCurso(expedienteId)) throw new ErrorNegocio('La IA ya está redactando esta escritura. Espere a que termine.');
  // Las reglas fijas se ejecutan siempre antes de redactar
  await ejecutarRevision(s, expedienteId, false);
  // Las marcas «FALTA» del borrador anterior (R12) no impiden redactar: se resuelven redactando de nuevo
  const criticas = (await bloqueos(expedienteId)).criticas.filter((o) => o.codigo !== CODIGO_BORRADOR_INCOMPLETO);
  if (criticas.length) throw new ErrorNegocio(`No se puede redactar la escritura: hay ${criticas.length} observación(es) CRÍTICA(S) abiertas.`);

  const datos = datosDe(e);
  const actos = actosDe(e);
  let ctx: ContextoEscritura;
  try {
    ctx = prepararContexto(datos, actos, await obtenerConfig('notaria'));
  } catch (err) {
    if (err instanceof ErrorDatos) throw new ErrorNegocio(`Faltan datos para redactar la escritura: ${err.faltantes.join(', ')}.`);
    throw err;
  }
  const asistente = (await estadoAsistente(expedienteId)).resultado;
  const obligatorias = (asistente?.preguntas ?? []).filter((p) => p.obligatoria && p.estado === 'PENDIENTE');
  if (obligatorias.length) throw new ErrorNegocio(`Responda primero ${obligatorias.length} pregunta(s) obligatoria(s) del asistente.`);

  // Los modelos aprobados: si falta uno, no se redacta
  const modelos: { tipoId: string; nombre: string; version: number; id: string; archivo: Buffer }[] = [];
  try {
    for (const tipoId of modelosDe(ctx)) {
      const p = await plantillaAprobada(tipoId);
      modelos.push({ tipoId, nombre: ACTOS[tipoId]?.nombre ?? tipoId, version: p.version, id: p.id, archivo: Buffer.from(p.archivo) });
    }
  } catch (err) {
    if (err instanceof ErrorPlantilla) throw new ErrorNegocio(err.message);
    throw err;
  }

  const analisis = await db.analisisIA.create({ data: { expedienteId, proposito: 'REDACCION', modelo: configuracionModelo('REDACCION').modelo, estado: 'EN_CURSO' } });
  const tarea = () => redactar(s, expedienteId, analisis.id, { datos, actos, ctx, modelos, asistente }).catch(async (err) => {
    const mensaje = err instanceof ErrorIA || err instanceof ErrorNegocio ? err.message : 'Error inesperado al redactar la escritura.';
    if (!(err instanceof ErrorIA) && !(err instanceof ErrorNegocio)) console.error('[redaccion]', err);
    await db.analisisIA.update({ where: { id: analisis.id }, data: { estado: 'ERROR', error: mensaje } }).catch(() => undefined);
    await notificar(s.usuario.id, { titulo: `La escritura no se pudo redactar · ${e.numeroInterno}`, mensaje, enlace: `/expedientes/${expedienteId}/borrador` }).catch(() => undefined);
  });
  return { tarea, modelos: modelos.length };
}

async function redactar(
  s: SesionActiva, expedienteId: string, analisisId: string,
  { datos, actos, ctx, modelos, asistente }: {
    datos: DatosExpediente; actos: string[]; ctx: ContextoEscritura;
    modelos: { tipoId: string; nombre: string; version: number; id: string; archivo: Buffer }[];
    asistente: Awaited<ReturnType<typeof estadoAsistente>>['resultado'];
  },
) {
  const e = await obtenerExpediente(s, expedienteId);
  const instr = await instruccionesAprobadas('REDACCION', actos);
  const documentos = await db.documento.findMany({ where: { expedienteId, estadoAnalisis: 'COMPLETADO' }, orderBy: { creadoEn: 'asc' } });
  const justificadas = await db.observacion.findMany({ where: { expedienteId, estado: 'JUSTIFICADA' }, select: { mensaje: true, justificacion: true } });

  const entrada = {
    actos: actos.map((id, i) => ({ orden: i + 1, id, nombre: ESQUEMAS[id]?.titulo ?? id, indicaciones: (datos.actos[id] as Record<string, unknown> | undefined)?.[CAMPO_INDICACIONES] ?? null })),
    expediente: { escritura: datos.escritura, personas: datos.personas, inmuebles: datos.inmuebles, actos: datos.actos },
    datos_calculados: { general: ctx.global, por_acto: ctx.actos.map((a) => ({ acto: a.id, ...a.contexto })) },
    respuestas_del_funcionario: (asistente?.preguntas ?? []).filter((p) => p.estado === 'RESPONDIDA').map((p) => ({
      pregunta: esAdicional(p.ruta) ? p.pregunta : p.etiqueta, respuesta: textoRespuesta(p.respuesta, datos),
    })),
    situaciones_aceptadas: justificadas.map((o) => ({ situacion: o.mensaje, decision: o.justificacion })),
    documentos: documentos.map((d) => ({ nombre: d.nombreOriginal, tipo: TIPOS_DOCUMENTALES[d.tipoDocumental as TipoDocumental] ?? d.tipoDocumental, hechos: hechosParaAsistente(d.tipoDocumental, d.hechos) })),
  };
  const r = await llamarEstructurado<RespuestaRedaccion>({
    proposito: 'REDACCION',
    sistema: SISTEMA_REDACCION + (instr.texto ? `\n\nInstrucciones adicionales aprobadas por la notaría:\n${instr.texto}` : ''),
    contenido: [
      ...modelos.map((m) => ({ type: 'text' as const, text: `<modelo tipo="${m.tipoId}" nombre="${m.nombre}" version="${m.version}">\n${textoDePlantilla(m.archivo).slice(0, LIMITE_MODELO)}\n</modelo>` })),
      { type: 'text', text: `<datos_del_caso>\n${JSON.stringify(entrada)}\n</datos_del_caso>\nRedacta la escritura completa de este caso tomando como base los modelos.` },
    ],
    esquema: ESQUEMA_REDACCION as unknown as Record<string, unknown>,
    maxTokens: 64000,
  });
  const parrafos = r.datos.parrafos.filter((p) => typeof p.texto === 'string');
  if (parrafos.filter((p) => p.texto.trim()).length < 5) throw new ErrorIA('La IA no devolvió el texto de la escritura. Intente de nuevo.', 'FORMATO');

  // El paquete del primer modelo (estilos, encabezado «Hoja No.», página) es la base del Word
  const resultado = armarEscritura(modelos[0].archivo, parrafos);
  const faltantes = [...r.datos.faltantes];
  for (const f of resultado.faltantes) if (!faltantes.some((x) => x.dato.toLowerCase() === f.toLowerCase())) faltantes.push({ dato: f, motivo: 'Marcado en el texto de la escritura.' });
  const info: InfoRedaccion = { resumen: r.datos.resumen.slice(0, 2000), faltantes: faltantes.slice(0, 50).map((f) => ({ dato: f.dato.slice(0, 300), motivo: f.motivo.slice(0, 500) })), advertencias: r.datos.advertencias.slice(0, 30).map((a) => a.slice(0, 1000)), modelo: r.modelo };

  let pdf: Buffer | null = null;
  try { pdf = await convertirAPdf(resultado.docx, `${e.numeroInterno}.docx`); } catch (err) { console.error('[redaccion] PDF', err); }
  const ultima = await db.borrador.findFirst({ where: { expedienteId }, orderBy: { version: 'desc' } });
  const usadas = modelos.map((m) => ({ tipoId: m.tipoId, version: m.version, id: m.id }));
  const borrador = await db.borrador.create({
    data: {
      expedienteId, version: (ultima?.version ?? 0) + 1, plantillasUsadas: usadas, generadoPorId: s.usuario.id,
      rutaDocxCifrada: await guardarCifrado(resultado.docx, 'borradores'),
      rutaPdfCifrada: pdf ? await guardarCifrado(pdf, 'borradores') : null,
      hashSha256: sha256(resultado.docx),
      redaccion: info as unknown as Prisma.InputJsonValue,
    },
  });

  // Las reglas sobre el texto nuevo: las marcas «FALTA» quedan como observación CRÍTICA (R12) hasta
  // que se completen los datos y se redacte de nuevo
  await ejecutarRevision(s, expedienteId, false).catch((err) => console.error('[redaccion] reglas', err));
  await db.analisisIA.update({ where: { id: analisisId }, data: {
    estado: 'COMPLETADO', modelo: r.modelo, versionInstruccion: instr.version, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, tokensCacheLectura: r.tokensCacheLectura, duracionMs: r.duracionMs,
    resultado: { borradorId: borrador.id, version: borrador.version, faltantes: info.faltantes.length, advertencias: info.advertencias.length },
  } });
  await auditar({ ...datosAuditoria(s), accion: 'BORRADOR_GENERADO', entidad: 'borrador', entidadId: borrador.id, detalle: { expedienteId, version: borrador.version, plantillas: usadas.map((u) => `${u.tipoId}@v${u.version}`), redaccionIA: true, faltantes: info.faltantes.length, pdf: !!pdf } });
  await notificar(s.usuario.id, {
    titulo: `Escritura redactada · ${e.numeroInterno}`,
    mensaje: `La IA redactó la versión ${borrador.version} sobre ${usadas.length === 1 ? 'la plantilla aprobada' : `${usadas.length} plantillas aprobadas`}.${info.faltantes.length ? ` Faltan ${info.faltantes.length} dato(s), marcados «FALTA» en el texto.` : ''} Revísela antes de enviarla.`,
    enlace: `/expedientes/${expedienteId}/borrador`,
  });
}
