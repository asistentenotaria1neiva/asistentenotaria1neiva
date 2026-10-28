/**
 * Corrección asistida de observaciones (paso 5 del flujo):
 *   1. El usuario elige las observaciones abiertas que quiere arreglar.
 *   2. La IA propone, para cada una, los cambios de datos que la resuelven (con su fuente),
 *      o explica por qué no se resuelve cambiando datos.
 *   3. El usuario elige qué propuestas aplicar. Nada se aplica solo.
 * Las propuestas se validan contra el catálogo de campos del formulario; al aplicarlas se
 * guardan por los mismos pasos del formulario (normalización y validación) y se ejecutan de
 * nuevo las reglas, que cierran las observaciones de reglas ya corregidas.
 */
import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { resolverRuta, validarValor, catalogo } from '../escritura/rutas';
import { leerRuta, escribirRuta } from '../escritura/validar-formulario';
import { llamarEstructurado, configuracionModelo, ErrorIA } from '../ia/cliente';
import { SISTEMA_CORRECCION, ESQUEMA_CORRECCION } from '../ia/instrucciones';
import { obtenerExpediente, puedeEditar, guardarPaso, datosDe, actosDe, ErrorNegocio, type ActualizacionPaso } from './expedientes';
import { evaluarExpediente, ejecutarRevision, resolverObservacion } from './revision';
import { instruccionesAprobadas } from './documentos';

export interface PropuestaCorreccion {
  observacionId: string;
  ruta: string;
  etiqueta: string;
  valorActual: unknown;
  valorNuevo: unknown;
  explicacion: string;
  fuente: string;
  estado: 'PENDIENTE' | 'APLICADA' | 'DESCARTADA';
}

export interface ResultadoCorreccion {
  correcciones: PropuestaCorreccion[];
  sinCorreccion: { observacionId: string; motivo: string }[];
}

/** Una propuesta EN_CURSO más antigua que esto se da por interrumpida (p. ej., el servidor se reinició) */
const LIMITE_PROPUESTA_MS = 30 * 60 * 1000;

/**
 * Estado de la corrección con IA del expediente: la que se está preparando en segundo plano,
 * la última propuesta con cambios por decidir y el error del último intento, si falló.
 */
export async function estadoCorreccion(expedienteId: string) {
  const ultima = await db.analisisIA.findFirst({ where: { expedienteId, proposito: 'CORRECCION' }, orderBy: { creadoEn: 'desc' } });
  if (ultima?.estado === 'EN_CURSO' && Date.now() - ultima.creadoEn.getTime() > LIMITE_PROPUESTA_MS) {
    await db.analisisIA.update({ where: { id: ultima.id }, data: { estado: 'ERROR', error: 'La propuesta se interrumpió antes de terminar. Pídala de nuevo.' } });
    ultima.estado = 'ERROR';
  }
  const r = ultima?.estado === 'COMPLETADO' ? ultima.resultado as ResultadoCorreccion | null : null;
  const pendiente = !!r && (r.correcciones.some((c) => c.estado === 'PENDIENTE') || r.sinCorreccion.length > 0);
  return {
    enCurso: ultima?.estado === 'EN_CURSO' ? ultima.creadoEn : null,
    propuesta: pendiente ? { id: ultima!.id, creadoEn: ultima!.creadoEn, ...r! } : null,
    error: ultima?.estado === 'ERROR' ? ultima.error : null,
  };
}

/**
 * Valida la petición y deja la propuesta EN_CURSO. Devuelve `tarea`, que la acción programa
 * para después de responder (la IA puede tardar minutos): la página muestra el avance.
 */
export async function proponerCorrecciones(s: SesionActiva, expedienteId: string, observacionIds: string[]) {
  const e = await obtenerExpediente(s, expedienteId);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('El expediente no se puede editar en su estado actual.');
  if ((await estadoCorreccion(expedienteId)).enCurso) throw new ErrorNegocio('La IA ya está preparando correcciones para este expediente. Espere a que termine.');
  const observaciones = await db.observacion.findMany({ where: { expedienteId, estado: 'ABIERTA', id: { in: observacionIds } } });
  if (!observaciones.length) throw new ErrorNegocio('Seleccione al menos una observación abierta.');
  const { datos, actos, documentos, borradorTexto } = await evaluarExpediente(expedienteId, s);
  const instr = await instruccionesAprobadas('REVISION', actos);
  const analisis = await db.analisisIA.create({ data: { expedienteId, proposito: 'CORRECCION', modelo: configuracionModelo('REVISION').modelo, estado: 'EN_CURSO', versionInstruccion: instr.version } });
  const tarea = async () => {
    try {
      const entrada = {
        actos,
        datos_formulario: datos,
        catalogo_campos: catalogo(actos),
        documentos: documentos.map((d) => ({ id: d.id, nombre: d.nombreOriginal, tipo: d.tipoDocumental, hechos: d.hechos })),
        observaciones: observaciones.map((o) => ({ id: o.id, nivel: o.nivel, origen: o.origen, mensaje: o.mensaje, campo: o.campo, evidencia: o.evidencia })),
        borrador: borradorTexto ?? '(no se pudo generar el borrador: faltan datos)',
      };
      const r = await llamarEstructurado<{ correcciones: { observacion_id: string; ruta: string; valor_json: string; explicacion: string; fuente: string }[]; sin_correccion: { observacion_id: string; motivo: string }[] }>({
        proposito: 'REVISION',
        sistema: SISTEMA_CORRECCION + (instr.texto ? `\n\nInstrucciones adicionales aprobadas por la notaría:\n${instr.texto}` : ''),
        contenido: [{ type: 'text', text: `<expediente>\n${JSON.stringify(entrada)}\n</expediente>\nPropón las correcciones de las observaciones recibidas.` }],
        esquema: ESQUEMA_CORRECCION as unknown as Record<string, unknown>,
      });

      // Se validan las propuestas: solo quedan las que apuntan a un campo real y traen un valor del tipo correcto
      const validas = new Set(observaciones.map((o) => o.id));
      const resultado: ResultadoCorreccion = { correcciones: [], sinCorreccion: [] };
      const descartar = (observacionId: string, motivo: string) => { if (validas.has(observacionId)) resultado.sinCorreccion.push({ observacionId, motivo: motivo.slice(0, 1000) }); };
      for (const c of r.datos.correcciones) {
        if (!validas.has(c.observacion_id)) continue;
        const destino = resolverRuta(datos, actos, c.ruta);
        if (!destino) { descartar(c.observacion_id, `La IA propuso modificar un campo que no existe (${c.ruta}). Corríjalo manualmente en el formulario.`); continue; }
        let valor: unknown;
        try { valor = JSON.parse(c.valor_json); } catch { valor = c.valor_json; }
        const v = validarValor(destino.campo, valor, datos);
        if ('error' in v) { descartar(c.observacion_id, `La IA propuso para «${destino.etiqueta}» un valor no válido (${v.error}). Corríjalo manualmente.`); continue; }
        const actual = leerRuta(datos, destino.rutaDatos) ?? null;
        if (JSON.stringify(actual) === JSON.stringify(v.valor)) continue;
        resultado.correcciones.push({ observacionId: c.observacion_id, ruta: c.ruta, etiqueta: destino.etiqueta, valorActual: actual, valorNuevo: v.valor, explicacion: c.explicacion.slice(0, 1000), fuente: c.fuente.slice(0, 1000), estado: 'PENDIENTE' });
      }
      for (const x of r.datos.sin_correccion) if (!resultado.correcciones.some((c) => c.observacionId === x.observacion_id)) descartar(x.observacion_id, x.motivo);
      for (const o of observaciones) {
        if (!resultado.correcciones.some((c) => c.observacionId === o.id) && !resultado.sinCorreccion.some((x) => x.observacionId === o.id)) descartar(o.id, 'La IA no encontró un cambio de datos que resuelva esta observación.');
      }

      await db.analisisIA.update({ where: { id: analisis.id }, data: { estado: 'COMPLETADO', modelo: r.modelo, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, tokensCacheLectura: r.tokensCacheLectura, duracionMs: r.duracionMs, resultado: resultado as unknown as Prisma.InputJsonValue } });
      await auditar({ ...datosAuditoria(s), accion: 'CORRECCION_IA_PROPUESTA', entidad: 'expediente', entidadId: e.id, detalle: { observaciones: observaciones.length, propuestas: resultado.correcciones.length, sinCorreccion: resultado.sinCorreccion.length } });
    } catch (err) {
      const mensaje = err instanceof ErrorIA ? err.message : 'Error inesperado al pedir las correcciones a la IA.';
      if (!(err instanceof ErrorIA)) console.error('[proponerCorrecciones]', err);
      await db.analisisIA.update({ where: { id: analisis.id }, data: { estado: 'ERROR', error: mensaje } }).catch((x) => console.error('[proponerCorrecciones]', x));
    }
  };
  return { observaciones: observaciones.length, tarea };
}

/**
 * Aplica las propuestas elegidas (por índice) y descarta las demás.
 * Una propuesta cuyo campo cambió después de generarla no se aplica: la IA la hizo sobre otro valor.
 */
export async function aplicarCorrecciones(s: SesionActiva, expedienteId: string, analisisId: string, indices: number[]) {
  const e = await obtenerExpediente(s, expedienteId);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('El expediente no se puede editar en su estado actual.');
  const a = await db.analisisIA.findFirst({ where: { id: analisisId, expedienteId, proposito: 'CORRECCION', estado: 'COMPLETADO' } });
  const r = a?.resultado as ResultadoCorreccion | null | undefined;
  if (!a || !r) throw new ErrorNegocio('La propuesta de corrección ya no existe.');

  const datos = datosDe(e);
  const actos = actosDe(e);
  const elegidas = new Set(indices);
  const pasos = new Set<string>();
  const omitidas: string[] = [];
  r.correcciones.forEach((c, i) => {
    if (c.estado !== 'PENDIENTE') return;
    if (!elegidas.has(i)) { c.estado = 'DESCARTADA'; return; }
    const destino = resolverRuta(datos, actos, c.ruta);
    if (!destino || JSON.stringify(leerRuta(datos, destino.rutaDatos) ?? null) !== JSON.stringify(c.valorActual)) {
      c.estado = 'DESCARTADA';
      omitidas.push(c.etiqueta);
      return;
    }
    escribirRuta(datos as unknown as Record<string, unknown>, destino.rutaDatos, c.valorNuevo);
    c.estado = 'APLICADA';
    pasos.add(typeof destino.paso === 'string' ? destino.paso : `acto:${destino.paso.acto}`);
  });

  // Se guarda por los mismos pasos del formulario: normalización, validación, entidades y auditoría
  let errores = 0;
  for (const p of pasos) {
    const act: ActualizacionPaso = p === 'escritura' ? { paso: 'escritura', valor: datos.escritura }
      : p === 'personas' ? { paso: 'personas', valor: datos.personas }
        : p === 'inmuebles' ? { paso: 'inmuebles', valor: datos.inmuebles }
          : { paso: 'acto', acto: p.slice(5), valor: (datos.actos[p.slice(5)] ?? {}) as Record<string, unknown> };
    errores += Object.keys((await guardarPaso(s, expedienteId, act)).errores).length;
  }
  // La propuesta queda decidida: las observaciones sin corrección ya se informaron
  await db.analisisIA.update({ where: { id: a.id }, data: { resultado: { ...r, sinCorreccion: [] } as unknown as Prisma.InputJsonValue } });

  // Observaciones de la IA con todos sus cambios aplicados: se cierran como corregidas
  const aplicadas = r.correcciones.filter((c) => c.estado === 'APLICADA');
  const porObservacion = new Map<string, PropuestaCorreccion[]>();
  for (const c of r.correcciones) porObservacion.set(c.observacionId, [...(porObservacion.get(c.observacionId) ?? []), c]);
  const observaciones = await db.observacion.findMany({ where: { id: { in: [...porObservacion.keys()] }, origen: 'IA', estado: 'ABIERTA' } });
  for (const o of observaciones) {
    const cambios = porObservacion.get(o.id)!;
    if (!cambios.every((c) => c.estado === 'APLICADA')) continue;
    await resolverObservacion(s, o.id, 'CORREGIDA', `Corregida con la IA: ${cambios.map((c) => `${c.etiqueta} → ${String(c.valorNuevo)}`).join('; ')}`.slice(0, 2000), false);
  }
  await auditar({ ...datosAuditoria(s), accion: 'CORRECCION_IA_APLICADA', entidad: 'expediente', entidadId: e.id, detalle: { aplicadas: aplicadas.length, descartadas: r.correcciones.length - aplicadas.length, omitidas: omitidas.length, campos: aplicadas.map((c) => c.ruta.replace(/:[^.]+\./, ':*.')) } });
  // Las reglas verifican lo corregido y cierran sus observaciones
  if (aplicadas.length) await ejecutarRevision(s, expedienteId, false);
  return { aplicadas: aplicadas.length, omitidas, errores };
}
