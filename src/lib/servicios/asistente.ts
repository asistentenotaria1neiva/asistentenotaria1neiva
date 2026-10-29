/**
 * Asistente de escrituración con IA. Una vez cargados los documentos:
 *   1. Se analizan los documentos pendientes (la IA identifica cada uno si el usuario no dijo qué es),
 *      en etapas y en paralelo: src/lib/servicios/tareas.ts.
 *   2. Los datos confiables se llevan al expediente; los dudosos o contradictorios no.
 *   3. La IA determina el tipo de escritura, advierte las inconsistencias entre documentos y
 *      formula las preguntas que faltan para completarla. Las reglas agregan las preguntas de los
 *      datos obligatorios que la IA no haya cubierto.
 *   4. El usuario confirma el tipo y responde. Ante una inconsistencia puede recargar el documento
 *      o continuar con los datos que tiene (queda registrado como observación justificada).
 * El número, la fecha, las hojas, los derechos y la retención no se preguntan: quedan en blanco en
 * el Word para el funcionario que hace la terminación.
 * Si el caso tiene algo poco común, la IA hace además preguntas adicionales que ningún campo del
 * formulario responde: se contestan con texto libre y quedan como observación para el revisor.
 */
import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { ESQUEMAS } from '../escritura/esquemas';
import { escribirRuta, leerRuta } from '../escritura/validar-formulario';
import { resolverRuta, validarValor, catalogo, convertirRespuesta, datosFaltantes, CAMPOS_TERMINACION, RECOMENDADOS_PERSONA, type Destino } from '../escritura/rutas';
import type { DatosExpediente } from '../escritura/tipos';
import { TIPOS_DOCUMENTALES, type TipoDocumental } from '../ia/documentos';
import { llamarEstructurado } from '../ia/cliente';
import { SISTEMA_ASISTENTE, esquemaAsistente } from '../ia/instrucciones';
import {
  obtenerExpediente, puedeEditar, datosDe, actosDe, guardarPaso, cambiarActos, aplicarSugerenciasConfiables, retirarInmueblesSobrantes, cerrarSugerenciasRespondidas, resolverDestino,
  ErrorNegocio, type ActualizacionPaso,
} from './expedientes';
import { instruccionesAprobadas } from './documentos';
import { ejecutarRevision, resolverObservacion } from './revision';

/** Código de las observaciones que crea el asistente */
export const CODIGO_INCONSISTENCIA = 'IA-ASISTENTE';
/** Observación con la respuesta a una pregunta adicional (caso especial) */
export const CODIGO_PREGUNTA_ADICIONAL = 'IA-PREGUNTA-ADICIONAL';
/** Ruta de las preguntas adicionales: no corresponden a un campo del formulario */
export const esAdicional = (ruta: string) => ruta.startsWith('adicional:');
const JUSTIFICACION_CONTINUAR = 'El funcionario decidió continuar con los datos actuales (asistente de IA).';

export interface PreguntaAsistente {
  id: string;
  ruta: string;
  etiqueta: string;
  pregunta: string;
  motivo: string;
  origen: 'IA' | 'REGLAS' | 'USUARIO';
  obligatoria: boolean;
  valorSugerido: unknown;
  fuente: string | null;
  estado: 'PENDIENTE' | 'RESPONDIDA' | 'OMITIDA';
  respuesta?: unknown;
}

export interface ResultadoAsistente {
  actosPropuestos: string[];
  actosConfirmados: boolean;
  explicacionTipo: string;
  tipoSinPlantilla: string | null;
  resumenDocumentos: string;
  documentosFaltantes: { documento: string; motivo: string }[];
  preguntas: PreguntaAsistente[];
  aplicadasAutomaticamente: number;
  /** Campos que la IA llenó desde los documentos sin preguntar (el funcionario los ve en el formulario) */
  completadosDesdeDocumentos?: { etiqueta: string; valor: string; fuente: string }[];
  erroresDocumentos: string[];
}

interface RespuestaIA {
  actos: string[];
  explicacion_tipo: string;
  tipo_sin_plantilla: string | null;
  resumen_documentos: string;
  documentos_faltantes: { documento: string; motivo: string }[];
  inconsistencias: { nivel: 'ADVERTENCIA' | 'INFORMATIVA'; mensaje: string; evidencia: string; documento_id: string | null }[];
  datos_desde_documentos?: { ruta: string; valor_json: string; fuente: string }[];
  preguntas: { ruta: string; pregunta: string; motivo: string; valor_sugerido_json: string | null; fuente: string | null }[];
  preguntas_adicionales: { pregunta: string; motivo: string; obligatoria: boolean }[];
}

/**
 * Último análisis del asistente: en curso, terminado (con sus preguntas) o fallido. Un análisis que
 * dejó de avanzar lo reanuda (o lo da por fallido) src/lib/servicios/tareas.ts antes de llamar aquí.
 */
export async function estadoAsistente(expedienteId: string) {
  const ultimo = await db.analisisIA.findFirst({ where: { expedienteId, proposito: 'ASISTENTE' }, orderBy: { creadoEn: 'desc' } });
  const completado = await db.analisisIA.findFirst({ where: { expedienteId, proposito: 'ASISTENTE', estado: 'COMPLETADO' }, orderBy: { creadoEn: 'desc' } });
  return {
    enCurso: ultimo?.estado === 'EN_CURSO' ? ultimo.creadoEn : null,
    error: ultimo?.estado === 'ERROR' ? ultimo.error : null,
    resultado: completado ? { id: completado.id, creadoEn: completado.creadoEn, ...(completado.resultado as unknown as ResultadoAsistente) } : null,
  };
}

/** Preguntas deterministas por los datos que aún faltan y que no están ya preguntados ni omitidos */
function preguntasDeReglas(datos: DatosExpediente, actos: string[], existentes: PreguntaAsistente[]): PreguntaAsistente[] {
  let n = existentes.length;
  return datosFaltantes(datos, actos)
    .filter((f) => !existentes.some((p) => p.ruta === f.ruta && p.estado !== 'RESPONDIDA'))
    .map((f) => ({
      id: `p${++n}`, ruta: f.ruta, etiqueta: f.etiqueta, pregunta: f.etiqueta, motivo: f.motivo, origen: 'REGLAS', obligatoria: f.obligatorio,
      valorSugerido: null, fuente: null, estado: 'PENDIENTE',
    }));
}

/** Datos opcionales que sí se preguntan cuando el caso los pide (cónyuge que coadyuva, venta de cuota, gravamen que subsiste, persona jurídica…) */
const OPCIONALES_DEL_CASO = new Set(['coadyuvante_id', 'vinculo', 'es_cuota', 'cuota_texto', 'excepcion_gravamen', 'representante_legal_id', 'representante_id', 'representacion', 'poder_entidad_soporte', 'descripcion_entidad', 'constitucion_texto']);
/** Datos del poder: solo si entre los documentos hay un poder */
const DEL_PODER = new Set(['apoderado_id', 'poder_tipo', 'poder_incluye_estado_civil', 'tarjeta_profesional']);

/**
 * ¿Vale la pena preguntar este campo? Lo obligatorio, lo que la escritura menciona de los
 * comparecientes y lo dudoso, sí; un dato opcional, solo si el caso lo pide. Los campos de un acto
 * por plantilla son las variables de la escritura: todos.
 */
function sePregunta(destino: Destino, dudoso: boolean, hayPoder: boolean): boolean {
  const id = destino.campo.id;
  if (dudoso || destino.campo.obligatorio || OPCIONALES_DEL_CASO.has(id)) return true;
  if (typeof destino.paso === 'object' && ESQUEMAS[destino.paso.acto]?.porPlantilla) return true;
  if (destino.paso === 'personas') return RECOMENDADOS_PERSONA.includes(id) || (DEL_PODER.has(id) && hayPoder);
  return false;
}

/** Para la IA, los datos dudosos se identifican por el id de la persona o el inmueble del expediente */
function rutaParaIA(datos: DatosExpediente, campo: string): string {
  const d = resolverDestino(datos, campo);
  if (!d || d.indice < 0 || d.base === 'acto') return campo;
  const id = d.base === 'persona' ? datos.personas[d.indice].id : datos.inmuebles[d.indice].id;
  return `${d.base}:${id}.${d.subcampo}`;
}

/**
 * Llena los campos vacíos que la IA tomó literalmente de los documentos (linderos del inmueble que
 * corresponde, datos de una plantilla…), por los mismos pasos del formulario, para no preguntarlos.
 * Nunca sobrescribe un dato ni toca uno dudoso. `datos` queda con los valores guardados.
 */
async function completarDesdeDocumentos(s: SesionActiva, expedienteId: string, datos: DatosExpediente, actos: string[], propuestos: { ruta: string; valor_json: string; fuente: string }[], dudosas: Set<string>) {
  const completados: { etiqueta: string; valor: string; fuente: string }[] = [];
  const pasos = new Set<string>();
  for (const x of propuestos) {
    const destino = resolverRuta(datos, actos, x.ruta);
    if (!destino || destino.campo.tipo === 'lista' || dudosas.has(x.ruta)) continue;
    if (destino.paso === 'escritura' && CAMPOS_TERMINACION.includes(destino.campo.id)) continue;
    const actual = leerRuta(datos, destino.rutaDatos);
    if (actual !== undefined && actual !== null && actual !== '') continue;
    let valor: unknown;
    try { valor = JSON.parse(x.valor_json); } catch { valor = x.valor_json; }
    const v = validarValor(destino.campo, valor, datos);
    if ('error' in v || v.valor === '' || v.valor === null) continue;
    escribirRuta(datos as unknown as Record<string, unknown>, destino.rutaDatos, v.valor);
    pasos.add(typeof destino.paso === 'string' ? destino.paso : `acto:${destino.paso.acto}`);
    completados.push({ etiqueta: destino.etiqueta, valor: String(v.valor).slice(0, 300), fuente: x.fuente.slice(0, 300) });
  }
  for (const p of pasos) {
    await guardarPaso(s, expedienteId, p === 'escritura' ? { paso: 'escritura', valor: datos.escritura }
      : p === 'personas' ? { paso: 'personas', valor: datos.personas }
        : p === 'inmuebles' ? { paso: 'inmuebles', valor: datos.inmuebles }
          : { paso: 'acto', acto: p.slice(5), valor: (datos.actos[p.slice(5)] ?? {}) as Record<string, unknown> });
  }
  if (completados.length) await auditar({ ...datosAuditoria(s), accion: 'ASISTENTE_DATOS_DOCUMENTOS', entidad: 'expediente', entidadId: expedienteId, detalle: { campos: completados.map((c) => c.etiqueta) } });
  return completados;
}

/**
 * Última etapa del asistente, cuando los documentos ya se analizaron (src/lib/servicios/tareas.ts los
 * analiza antes, en etapas): lleva los datos confiables al expediente y la IA determina el tipo de
 * escritura, las inconsistencias y las preguntas. Deja el análisis COMPLETADO; si falla, lanza el error.
 */
export async function prepararPreguntas(s: SesionActiva, expedienteId: string, analisisId: string, erroresDocumentos: string[]) {
  const e = await obtenerExpediente(s, expedienteId);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('El expediente no se puede editar en su estado actual.');
  const instr = await instruccionesAprobadas('REVISION', actosDe(e));
  // 2. Datos confiables al expediente
  const { aplicadas, dudosos } = await aplicarSugerenciasConfiables(s, expedienteId);
  await retirarInmueblesSobrantes(s, expedienteId);
  const actual = await obtenerExpediente(s, expedienteId);
  const datos = datosDe(actual);
  const actosActuales = actosDe(actual);
  // Un PDF separado en partes no cuenta: sus documentos son las partes
  const docs = await db.documento.findMany({ where: { expedienteId, estadoAnalisis: { not: 'DIVIDIDO' } }, orderBy: { creadoEn: 'asc' } });
  // Las preguntas adicionales ya respondidas en un análisis anterior no se repiten
  const previo = (await estadoAsistente(expedienteId)).resultado;
  const adicionalesPrevias = (previo?.preguntas ?? []).filter((p) => esAdicional(p.ruta) && p.estado === 'RESPONDIDA');

  // 3. La IA: tipo, inconsistencias y preguntas
  const entrada = {
    actos_elegidos_por_el_usuario: actosActuales,
    catalogo_actos: Object.values(ESQUEMAS).map((x) => ({ id: x.tipo, titulo: x.titulo, documentos_soporte: x.documentosSoporte.map((d) => `${d.etiqueta}${d.obligatorio ? '' : ' (si aplica)'}`) })),
    // Los campos de los actos elegidos (los de plantilla pueden ser muchos); si la IA propone otro acto, sus campos se preguntan al confirmarlo
    catalogo_campos: catalogo(actosActuales.length ? actosActuales : Object.keys(ESQUEMAS), { sinTerminacion: true }),
    datos_expediente: datos,
    documentos: docs.map((d) => ({ id: d.id, nombre: d.nombreOriginal, tipo: TIPOS_DOCUMENTALES[d.tipoDocumental as TipoDocumental] ?? d.tipoDocumental, estado_analisis: d.estadoAnalisis, hechos: d.hechos })),
    datos_dudosos: dudosos.map((x) => ({ ruta: rutaParaIA(datos, x.campo), motivo: x.motivo, valores: x.valores })),
    documentos_con_error: erroresDocumentos,
    respuestas_adicionales_previas: adicionalesPrevias.map((p) => ({ pregunta: p.pregunta, respuesta: p.respuesta })),
  };
  const r = await llamarEstructurado<RespuestaIA>({
    proposito: 'REVISION',
    sistema: SISTEMA_ASISTENTE + (instr.texto ? `\n\nInstrucciones adicionales aprobadas por la notaría:\n${instr.texto}` : ''),
    contenido: [{ type: 'text', text: `<expediente>\n${JSON.stringify(entrada)}\n</expediente>\nDetermina el tipo de escritura, las inconsistencias y todas las preguntas, incluidas las adicionales si el caso tiene algo poco común.` }],
    esquema: esquemaAsistente(Object.keys(ESQUEMAS)),
  });

  // 4. Se valida la respuesta contra los esquemas
  const propuestos = [...new Set(r.datos.actos.filter((a) => ESQUEMAS[a]))];
  const actos = propuestos.length ? propuestos : actosActuales;
  const rutasDudosas = new Set(dudosos.map((x) => rutaParaIA(datos, x.campo)));
  const vacio = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
  // Los campos de un acto que el usuario aún no confirmó no se llenan: se preguntan al confirmarlo
  const completados = await completarDesdeDocumentos(s, expedienteId, datos, actos.filter((a) => actosActuales.includes(a)), r.datos.datos_desde_documentos ?? [], rutasDudosas);
  const hayPoder = docs.some((d) => d.tipoDocumental === 'PODER');
  // Lo que leyó la IA de un dato dudoso: va como respuesta sugerida, para confirmarla o corregirla
  const lecturaDudosa = (ruta: string, destino: Destino) => {
    const x = dudosos.find((d) => rutaParaIA(datos, d.campo) === ruta);
    const v = x?.valores.map((y) => validarValor(destino.campo, y.valor, datos)).find((y) => !('error' in y));
    return v && 'valor' in v ? { valor: v.valor, fuente: x!.valores[0]?.documento ?? null } : null;
  };
  const preguntas: PreguntaAsistente[] = [];
  for (const p of r.datos.preguntas) {
    const destino = resolverRuta(datos, actos, p.ruta);
    if (!destino || destino.campo.tipo === 'lista' || preguntas.some((x) => x.ruta === p.ruta)) continue;
    if (destino.paso === 'escritura' && CAMPOS_TERMINACION.includes(destino.campo.id)) continue;
    // Lo que ya tiene valor (digitado, de los documentos o recién llenado) no se pregunta, salvo que sea dudoso
    if (!rutasDudosas.has(p.ruta) && !vacio(leerRuta(datos, destino.rutaDatos))) continue;
    if (!sePregunta(destino, rutasDudosas.has(p.ruta), hayPoder)) continue;
    let sugerido: unknown = null;
    let fuente = p.fuente?.slice(0, 500) ?? null;
    if (p.valor_sugerido_json) {
      let v: unknown;
      try { v = JSON.parse(p.valor_sugerido_json); } catch { v = p.valor_sugerido_json; }
      const ok = validarValor(destino.campo, v, datos);
      if (!('error' in ok)) sugerido = ok.valor;
    }
    if (sugerido === null) {
      const l = lecturaDudosa(p.ruta, destino);
      if (l) { sugerido = l.valor; fuente = l.fuente; }
    }
    preguntas.push({
      id: `p${preguntas.length + 1}`, ruta: p.ruta, etiqueta: destino.etiqueta, pregunta: p.pregunta.slice(0, 500), motivo: p.motivo.slice(0, 500), origen: 'IA',
      obligatoria: !!destino.campo.obligatorio, valorSugerido: sugerido, fuente: sugerido === null ? null : fuente, estado: 'PENDIENTE',
    });
  }
  // Todo dato dudoso se pregunta, aunque la IA no lo haya hecho: así se decide cada sugerencia pendiente
  for (const x of dudosos) {
    const ruta = rutaParaIA(datos, x.campo);
    const destino = resolverRuta(datos, actos, ruta);
    if (!destino || destino.campo.tipo === 'lista' || preguntas.some((p) => p.ruta === ruta)) continue;
    const sugerido = x.valores.map((v) => validarValor(destino.campo, v.valor, datos)).find((v) => !('error' in v));
    preguntas.push({
      id: `p${preguntas.length + 1}`, ruta, etiqueta: destino.etiqueta, pregunta: `Confirme: ${destino.etiqueta}`,
      motivo: `Dato dudoso (${x.motivo}): ${x.valores.map((v) => `«${String(v.valor)}» en ${v.documento}`).join('; ')}.`.slice(0, 500),
      origen: 'REGLAS', obligatoria: !!destino.campo.obligatorio, valorSugerido: sugerido && 'valor' in sugerido ? sugerido.valor : null, fuente: x.valores[0]?.documento ?? null, estado: 'PENDIENTE',
    });
  }
  // Preguntas del caso especial que ningún campo responde: texto libre
  for (const p of r.datos.preguntas_adicionales ?? []) {
    const texto = p.pregunta.trim().slice(0, 500);
    if (!texto || preguntas.some((x) => x.pregunta === texto)) continue;
    preguntas.push({
      id: `p${preguntas.length + 1}`, ruta: `adicional:${preguntas.length + 1}`, etiqueta: 'Pregunta adicional del caso', pregunta: texto, motivo: p.motivo.slice(0, 500),
      origen: 'IA', obligatoria: !!p.obligatoria, valorSugerido: null, fuente: null, estado: 'PENDIENTE',
    });
  }
  // Las ya respondidas se conservan, para verlas y para que un análisis posterior no las repita
  for (const p of adicionalesPrevias) if (!preguntas.some((x) => x.pregunta === p.pregunta)) preguntas.push({ ...p, id: `p${preguntas.length + 1}`, ruta: `adicional:${preguntas.length + 1}` });
  preguntas.push(...preguntasDeReglas(datos, actos, preguntas));

  // Las inconsistencias quedan como observaciones; las de un análisis anterior sin decidir se reemplazan
  await db.observacion.updateMany({ where: { expedienteId, codigo: CODIGO_INCONSISTENCIA, estado: 'ABIERTA' }, data: { estado: 'CORREGIDA', resueltaEn: new Date(), justificacion: 'Reemplazada por un análisis posterior del asistente.' } });
  const idsDocs = new Set(docs.map((d) => d.id));
  for (const i of r.datos.inconsistencias) {
    const documentoId = i.documento_id && idsDocs.has(i.documento_id) ? i.documento_id : null;
    await db.observacion.create({ data: { expedienteId, origen: 'IA', codigo: CODIGO_INCONSISTENCIA, nivel: i.nivel, mensaje: i.mensaje.slice(0, 2000), evidencia: { detalle: i.evidencia.slice(0, 2000), documentoId } } });
  }

  const resultado: ResultadoAsistente = {
    actosPropuestos: actos,
    actosConfirmados: actosActuales.length > 0 && JSON.stringify(actosActuales) === JSON.stringify(actos),
    explicacionTipo: r.datos.explicacion_tipo.slice(0, 2000),
    tipoSinPlantilla: r.datos.tipo_sin_plantilla?.slice(0, 300) ?? null,
    resumenDocumentos: r.datos.resumen_documentos.slice(0, 2000),
    documentosFaltantes: r.datos.documentos_faltantes.slice(0, 20).map((d) => ({ documento: d.documento.slice(0, 300), motivo: d.motivo.slice(0, 500) })),
    preguntas,
    aplicadasAutomaticamente: aplicadas + completados.length,
    completadosDesdeDocumentos: completados,
    erroresDocumentos,
  };
  await db.analisisIA.update({ where: { id: analisisId }, data: { estado: 'COMPLETADO', modelo: r.modelo, versionInstruccion: instr.version, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, tokensCacheLectura: r.tokensCacheLectura, duracionMs: r.duracionMs, resultado: resultado as unknown as Prisma.InputJsonValue } });
  await auditar({ ...datosAuditoria(s), accion: 'ASISTENTE_ANALISIS', entidad: 'expediente', entidadId: expedienteId, detalle: { actos, preguntas: preguntas.length, adicionales: preguntas.filter((p) => esAdicional(p.ruta) && p.estado === 'PENDIENTE').length, inconsistencias: r.datos.inconsistencias.length, aplicadas, documentosConError: erroresDocumentos.length } });
  return { numeroInterno: e.numeroInterno, obligatoriasPendientes: preguntas.filter((p) => p.obligatoria && p.estado === 'PENDIENTE').length, actosConfirmados: resultado.actosConfirmados };
}

export interface RespuestasAsistente {
  /** Actos confirmados por el usuario (solo si cambian o se confirman) */
  actos?: string[];
  /** Respuesta por id de pregunta: texto o lista de valores marcados */
  respuestas: Record<string, string | string[]>;
  /** Preguntas no obligatorias que el usuario decide dejar sin respuesta */
  omitidas: string[];
}

/**
 * Guarda las respuestas en el expediente (por los mismos pasos del formulario: normalización,
 * validación y auditoría), agrega las preguntas por los datos que sigan faltando y ejecuta las reglas.
 */
export async function responderAsistente(s: SesionActiva, expedienteId: string, analisisId: string, entrada: RespuestasAsistente) {
  const e = await obtenerExpediente(s, expedienteId);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('El expediente no se puede editar en su estado actual.');
  const a = await db.analisisIA.findFirst({ where: { id: analisisId, expedienteId, proposito: 'ASISTENTE', estado: 'COMPLETADO' } });
  const r = a?.resultado as ResultadoAsistente | null | undefined;
  if (!a || !r) throw new ErrorNegocio('El análisis del asistente ya no existe. Ejecútelo de nuevo.');

  if (entrada.actos) {
    await cambiarActos(s, expedienteId, entrada.actos);
    r.actosConfirmados = true;
  }
  if (!r.actosConfirmados) throw new ErrorNegocio('Confirme primero el tipo de escritura.');
  const actualizado = await obtenerExpediente(s, expedienteId);
  const actos = actosDe(actualizado);
  const datos = datosDe(actualizado);

  const errores: Record<string, string> = {};
  const pasos = new Set<string>();
  let respondidas = 0;
  for (const p of r.preguntas) {
    if (p.estado !== 'PENDIENTE') continue;
    if (esAdicional(p.ruta)) {
      // Texto libre: queda en la pregunta y como observación para el revisor y el notario
      if (entrada.omitidas.includes(p.id)) {
        if (p.obligatoria) errores[p.id] = 'Esta pregunta es obligatoria: no se puede dejar sin respuesta.';
        else p.estado = 'OMITIDA';
        continue;
      }
      const texto = String(entrada.respuestas[p.id] ?? '').trim().slice(0, 2000);
      if (!texto) continue;
      await db.observacion.create({ data: {
        expedienteId, origen: 'IA', codigo: CODIGO_PREGUNTA_ADICIONAL, nivel: 'INFORMATIVA', mensaje: `Caso especial: ${p.pregunta}`.slice(0, 2000),
        evidencia: { detalle: p.motivo }, estado: 'JUSTIFICADA', justificacion: texto, resueltaEn: new Date(),
      } });
      p.estado = 'RESPONDIDA';
      p.respuesta = texto;
      respondidas++;
      continue;
    }
    const destino = resolverRuta(datos, actos, p.ruta);
    if (!destino) {
      // P. ej. una pregunta de un acto que el usuario retiró al confirmar el tipo
      p.estado = 'OMITIDA';
      continue;
    }
    if (entrada.omitidas.includes(p.id)) {
      if (p.obligatoria) errores[p.id] = 'Este dato es obligatorio: no se puede dejar sin respuesta.';
      else p.estado = 'OMITIDA';
      continue;
    }
    const valor = convertirRespuesta(destino.campo, entrada.respuestas[p.id]);
    if (valor === undefined) continue;
    const v = validarValor(destino.campo, valor, datos);
    if ('error' in v) { errores[p.id] = `Respuesta no válida: ${v.error}.`; continue; }
    escribirRuta(datos as unknown as Record<string, unknown>, destino.rutaDatos, v.valor);
    p.estado = 'RESPONDIDA';
    p.respuesta = v.valor;
    respondidas++;
    pasos.add(typeof destino.paso === 'string' ? destino.paso : `acto:${destino.paso.acto}`);
  }

  // Se guarda por los mismos pasos del formulario
  let erroresFormulario = 0;
  for (const p of pasos) {
    const act: ActualizacionPaso = p === 'escritura' ? { paso: 'escritura', valor: datos.escritura }
      : p === 'personas' ? { paso: 'personas', valor: datos.personas }
        : p === 'inmuebles' ? { paso: 'inmuebles', valor: datos.inmuebles }
          : { paso: 'acto', acto: p.slice(5), valor: (datos.actos[p.slice(5)] ?? {}) as Record<string, unknown> };
    erroresFormulario += Object.keys((await guardarPaso(s, expedienteId, act)).errores).length;
  }

  // Lo que siga faltando (p. ej. por un acto agregado al confirmar el tipo) se convierte en preguntas nuevas
  const guardados = datosDe(await obtenerExpediente(s, expedienteId));
  r.preguntas.push(...preguntasDeReglas(guardados, actos, r.preguntas));
  await db.analisisIA.update({ where: { id: a.id }, data: { resultado: r as unknown as Prisma.InputJsonValue } });
  await auditar({ ...datosAuditoria(s), accion: 'ASISTENTE_RESPUESTAS', entidad: 'expediente', entidadId: expedienteId, detalle: { respondidas, errores: Object.keys(errores).length, campos: r.preguntas.filter((p) => p.estado === 'RESPONDIDA').map((p) => p.ruta.replace(/:[^.]+\./, ':*.')) } });
  if (respondidas) {
    await cerrarSugerenciasRespondidas(s, expedienteId);
    await ejecutarRevision(s, expedienteId, false);
  }
  const pendientes = r.preguntas.filter((p) => p.estado === 'PENDIENTE');
  return { respondidas, errores, pendientes: pendientes.length, obligatoriasPendientes: pendientes.filter((p) => p.obligatoria).length, erroresFormulario };
}

/** El usuario decide seguir con los datos que tiene: las inconsistencias quedan justificadas (las ve el revisor) */
export async function continuarConDatos(s: SesionActiva, expedienteId: string, observacionIds: string[]) {
  const e = await obtenerExpediente(s, expedienteId);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('El expediente no se puede editar en su estado actual.');
  const abiertas = await db.observacion.findMany({ where: { expedienteId, codigo: CODIGO_INCONSISTENCIA, estado: 'ABIERTA', id: { in: observacionIds } } });
  for (const o of abiertas) await resolverObservacion(s, o.id, 'JUSTIFICADA', JUSTIFICACION_CONTINUAR, false);
  return abiertas.length;
}

/**
 * Agrega una pregunta para corregir o completar un dato: desde la revisión de los datos de la
 * escritura, al cambiar una respuesta o desde una observación. Si ya hay una pregunta pendiente
 * sobre ese dato, no se duplica.
 */
export async function agregarPregunta(s: SesionActiva, expedienteId: string, ruta: string, motivo?: string) {
  const e = await obtenerExpediente(s, expedienteId);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('El expediente no se puede editar en su estado actual.');
  const a = await db.analisisIA.findFirst({ where: { expedienteId, proposito: 'ASISTENTE', estado: 'COMPLETADO' }, orderBy: { creadoEn: 'desc' } });
  const r = a?.resultado as ResultadoAsistente | null | undefined;
  if (!a || !r) throw new ErrorNegocio('Ejecute primero el asistente de IA.');
  const destino = resolverRuta(datosDe(e), actosDe(e), ruta);
  if (!destino || destino.campo.tipo === 'lista') throw new ErrorNegocio('Ese dato no se puede corregir desde el asistente.');
  if (r.preguntas.some((p) => p.ruta === ruta && p.estado === 'PENDIENTE')) return 'La pregunta ya está en la lista.';
  r.preguntas.push({
    id: `p${r.preguntas.length + 1}`, ruta, etiqueta: destino.etiqueta, pregunta: `Corregir: ${destino.etiqueta}`, motivo: (motivo ?? 'Corrección solicitada por el funcionario.').slice(0, 500),
    origen: 'USUARIO', obligatoria: !!destino.campo.obligatorio, valorSugerido: null, fuente: null, estado: 'PENDIENTE',
  });
  await db.analisisIA.update({ where: { id: a.id }, data: { resultado: r as unknown as Prisma.InputJsonValue } });
  return 'Pregunta agregada.';
}
