/**
 * Revisión del expediente (paso 5 del flujo):
 *   1. Reglas fijas (validaciones y cruces deterministas).
 *   2. Revisión de la IA sobre el conjunto (datos + documentos + texto del borrador).
 * Las observaciones se sincronizan: las nuevas se agregan, las que dejan de cumplirse se
 * marcan CORREGIDA (el dato se corrigió), y las resueltas por una persona se conservan.
 * Ninguna observación se descarta sola: aceptar o descartar queda registrado con justificación.
 */
import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { evaluarReglas, type Hallazgo, type DocumentoAnalizado } from '../reglas/reglas';
import { prepararContexto } from '../escritura/contexto';
import { ErrorDatos } from '../escritura/personas';
import { generarBorrador } from '../escritura/generar';
import { obtenerConfig } from '../configuracion';
import { llamarEstructurado, ErrorIA } from '../ia/cliente';
import { SISTEMA_REVISION, ESQUEMA_REVISION } from '../ia/instrucciones';
import type { ResultadoExtraccion, TipoDocumental } from '../ia/documentos';
import { obtenerExpediente, datosDe, actosDe, ErrorNegocio } from './expedientes';
import { instruccionesAprobadas } from './documentos';
import { registrarCorreccion } from './aprendizaje';

/** Texto de vista previa con la última versión de cada plantilla (aprobada o no), solo para revisar */
async function textoVistaPrevia(datos: ReturnType<typeof datosDe>, actos: string[]) {
  const notaria = await obtenerConfig('notaria');
  const ctx = prepararContexto(datos, actos, notaria);
  const r = await generarBorrador(ctx, async (id) => {
    const p = (await db.plantilla.findFirst({ where: { tipoId: id, estado: 'APROBADA' }, orderBy: { version: 'desc' } }))
      ?? (await db.plantilla.findFirst({ where: { tipoId: id, estado: 'PENDIENTE_APROBACION' }, orderBy: { version: 'desc' } }));
    if (!p) throw new ErrorNegocio(`No existe plantilla para ${id}.`);
    return Buffer.from(p.archivo);
  });
  return r.texto;
}

export async function evaluarExpediente(expedienteId: string, s: SesionActiva) {
  const e = await obtenerExpediente(s, expedienteId);
  const datos = datosDe(e);
  const actos = actosDe(e);
  const documentos = await db.documento.findMany({ where: { expedienteId } });
  const pendientes = await db.datoExtraido.count({ where: { expedienteId, estado: 'PENDIENTE', revisionManual: true } });
  const hallazgos: Hallazgo[] = [];
  let borradorTexto: string | undefined;
  try {
    borradorTexto = await textoVistaPrevia(datos, actos);
  } catch (err) {
    if (err instanceof ErrorDatos) for (const f of err.faltantes) hallazgos.push({ codigo: 'R00-DATO-FALTANTE', nivel: 'CRITICA', mensaje: `Falta: ${f}.` });
    else if (err instanceof ErrorNegocio) hallazgos.push({ codigo: 'R00-PLANTILLA', nivel: 'CRITICA', mensaje: err.message });
    else throw err;
  }
  hallazgos.push(...evaluarReglas({
    datos, actos, borradorTexto, pendientesConfianzaBaja: pendientes,
    documentos: documentos.map<DocumentoAnalizado>((d) => ({ id: d.id, nombre: d.nombreOriginal, tipo: d.tipoDocumental as TipoDocumental, hechos: d.hechos as unknown as ResultadoExtraccion | null })),
    config: {
      diasVigenciaCertificado: await obtenerConfig('reglas.dias_vigencia_certificado'),
      diasAvisoPazSalvo: await obtenerConfig('reglas.dias_aviso_paz_salvo'),
      diasVigenciaCertificadoExistencia: await obtenerConfig('reglas.dias_vigencia_cert_existencia'),
    },
  }));
  return { e, datos, actos, documentos, hallazgos, borradorTexto };
}

/** Sincroniza las observaciones de reglas con los hallazgos actuales */
async function sincronizarReglas(expedienteId: string, hallazgos: Hallazgo[]) {
  const existentes = await db.observacion.findMany({ where: { expedienteId, origen: 'REGLA' } });
  const clave = (o: { codigo: string; mensaje: string }) => `${o.codigo}|${o.mensaje}`;
  const actuales = new Set(hallazgos.map(clave));
  let nuevas = 0;
  for (const h of hallazgos) {
    const ex = existentes.find((o) => clave(o) === clave(h));
    if (!ex) {
      await db.observacion.create({ data: { expedienteId, origen: 'REGLA', codigo: h.codigo, nivel: h.nivel, mensaje: h.mensaje, campo: h.campo, evidencia: h.evidencia as Prisma.InputJsonValue } });
      nuevas++;
    } else if (ex.estado === 'CORREGIDA' && ex.justificacion?.startsWith('Verificado por las reglas')) {
      // Volvió a presentarse después de haberse corregido: se reabre
      await db.observacion.update({ where: { id: ex.id }, data: { estado: 'ABIERTA', resueltaEn: null, justificacion: null } });
    }
  }
  for (const o of existentes) {
    if (o.estado === 'ABIERTA' && !actuales.has(clave(o))) {
      await db.observacion.update({ where: { id: o.id }, data: { estado: 'CORREGIDA', resueltaEn: new Date(), justificacion: 'Verificado por las reglas: el dato fue corregido.', falsaAlarma: false } });
    }
  }
  return nuevas;
}

export async function ejecutarRevision(s: SesionActiva, expedienteId: string, conIA: boolean) {
  const { e, datos, actos, documentos, hallazgos, borradorTexto } = await evaluarExpediente(expedienteId, s);
  const nuevasReglas = await sincronizarReglas(expedienteId, hallazgos);
  let nuevasIA = 0;
  let errorIA: string | undefined;
  if (conIA) {
    const instr = await instruccionesAprobadas('REVISION', actos);
    const analisis = await db.analisisIA.create({ data: { expedienteId, proposito: 'REVISION', modelo: process.env.CLAUDE_MODELO_REVISION || 'claude-opus-5-5', estado: 'EN_CURSO', versionInstruccion: instr.version } });
    try {
      const entrada = {
        actos,
        datos_formulario: datos,
        documentos: documentos.map((d) => ({ id: d.id, nombre: d.nombreOriginal, tipo: d.tipoDocumental, hechos: d.hechos })),
        observaciones_automaticas: hallazgos.map((h) => ({ nivel: h.nivel, mensaje: h.mensaje })),
        borrador: borradorTexto ?? '(no se pudo generar el borrador: faltan datos)',
      };
      const r = await llamarEstructurado<{ observaciones: { nivel: 'CRITICA' | 'ADVERTENCIA' | 'INFORMATIVA'; mensaje: string; campo: string | null; evidencia: string }[] }>({
        proposito: 'REVISION',
        sistema: SISTEMA_REVISION + (instr.texto ? `\n\nInstrucciones adicionales aprobadas por la notaría:\n${instr.texto}` : ''),
        contenido: [{ type: 'text', text: `<expediente>\n${JSON.stringify(entrada)}\n</expediente>\nRevisa el expediente y devuelve las observaciones.` }],
        esquema: ESQUEMA_REVISION as unknown as Record<string, unknown>,
      });
      // Las observaciones de IA anteriores sin resolver se reemplazan por las de esta revisión
      await db.observacion.updateMany({ where: { expedienteId, origen: 'IA', estado: 'ABIERTA' }, data: { estado: 'CORREGIDA', resueltaEn: new Date(), justificacion: 'Reemplazada por una revisión posterior de la IA.' } });
      for (const o of r.datos.observaciones) {
        await db.observacion.create({ data: { expedienteId, origen: 'IA', codigo: 'IA', nivel: o.nivel, mensaje: o.mensaje.slice(0, 2000), campo: o.campo, evidencia: { detalle: o.evidencia.slice(0, 2000) } } });
        nuevasIA++;
      }
      await db.analisisIA.update({ where: { id: analisis.id }, data: { estado: 'COMPLETADO', modelo: r.modelo, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, tokensCacheLectura: r.tokensCacheLectura, duracionMs: r.duracionMs, resultado: r.datos as unknown as Prisma.InputJsonValue } });
    } catch (err) {
      errorIA = err instanceof ErrorIA ? err.message : 'Error inesperado en la revisión de la IA.';
      if (!(err instanceof ErrorIA)) console.error('[ejecutarRevision]', err);
      await db.analisisIA.update({ where: { id: analisis.id }, data: { estado: 'ERROR', error: errorIA } });
    }
  }
  await auditar({ ...datosAuditoria(s), accion: 'REVISION_EJECUTADA', entidad: 'expediente', entidadId: e.id, detalle: { reglas: hallazgos.length, nuevasReglas, nuevasIA, conIA, errorIA } });
  return { hallazgos: hallazgos.length, nuevasReglas, nuevasIA, errorIA };
}

export async function resolverObservacion(s: SesionActiva, observacionId: string, decision: 'CORREGIDA' | 'JUSTIFICADA' | 'DESCARTADA', justificacion: string, falsaAlarma: boolean) {
  const o = await db.observacion.findUniqueOrThrow({ where: { id: observacionId } });
  const e = await obtenerExpediente(s, o.expedienteId);
  if (o.estado !== 'ABIERTA') throw new ErrorNegocio('La observación ya fue resuelta.');
  const texto = justificacion.trim();
  if (o.nivel === 'CRITICA') {
    if (o.origen === 'REGLA') throw new ErrorNegocio('Una observación CRÍTICA de las reglas solo se cierra corrigiendo el dato y ejecutando de nuevo la revisión.');
    if (decision === 'JUSTIFICADA') throw new ErrorNegocio('Una observación CRÍTICA no se puede justificar: corrija el dato o, si es una falsa alarma, un revisor puede descartarla.');
    if (decision === 'DESCARTADA' && s.usuario.rol === 'DIGITADOR') throw new ErrorNegocio('Solo un revisor o el administrador puede descartar una observación crítica de la IA.');
  }
  if ((decision === 'JUSTIFICADA' || decision === 'DESCARTADA') && texto.length < 15) throw new ErrorNegocio('Escriba una justificación de al menos 15 caracteres.');
  if (decision === 'CORREGIDA' && o.origen === 'REGLA') throw new ErrorNegocio('Corrija el dato y ejecute de nuevo la revisión: la regla verificará la corrección.');
  await db.observacion.update({ where: { id: o.id }, data: { estado: decision, justificacion: texto || null, falsaAlarma: decision === 'DESCARTADA' ? true : falsaAlarma, resueltaPorId: s.usuario.id, resueltaEn: new Date() } });
  await registrarCorreccion({ expedienteId: e.id, tipoId: e.tipoId, categoria: 'OBSERVACION', campo: o.codigo, motivo: `${decision}${texto ? `: ${texto}` : ''}`, creadoPorId: s.usuario.id, datos: datosDe(e) });
  await auditar({ ...datosAuditoria(s), accion: 'OBSERVACION_RESUELTA', entidad: 'observacion', entidadId: o.id, detalle: { decision, nivel: o.nivel, origen: o.origen, falsaAlarma: decision === 'DESCARTADA' ? true : falsaAlarma } });
}
