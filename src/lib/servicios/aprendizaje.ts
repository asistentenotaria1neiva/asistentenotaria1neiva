/**
 * Ciclo de entrenamiento (sección 6.5): cada corrección del personal sobre un dato
 * extraído, una observación o un borrador se guarda como caso de aprendizaje ANONIMIZADO.
 * Con esos casos el panel muestra los patrones de error por tipo de escritura y los
 * indicadores mensuales. El modelo de Anthropic no se reentrena: se ajustan instrucciones,
 * reglas, formularios y plantillas (todo versionado).
 */
import 'server-only';
import { db } from '../db';
import type { DatosExpediente } from '../escritura/tipos';

/** Enmascara un valor conservando su estructura (útil para ver el tipo de error sin el dato) */
export function enmascarar(valor: unknown): string {
  return String(valor ?? '').replace(/\d/g, '9').replace(/[A-ZÁÉÍÓÚÑ]/g, 'X').replace(/[a-záéíóúñ]/g, 'x').slice(0, 200);
}

const CAMPOS_SENSIBLES = /nombre|documento|direccion|matricula|catastral|linderos|tradente|lugar|domicilio|causante|serial|notaria|acuerdo/i;

/** Reemplaza nombres, documentos, matrículas y direcciones del expediente en un texto libre */
export function anonimizarTexto(texto: string, datos?: DatosExpediente): string {
  let t = texto;
  for (const p of datos?.personas ?? []) {
    if (p.nombre) t = t.split(p.nombre).join('[PERSONA]');
    if (p.numero_documento) t = t.split(p.numero_documento).join('[DOCUMENTO]');
  }
  for (const i of datos?.inmuebles ?? []) {
    for (const v of [i.matricula, i.cedula_catastral, i.cedula_catastral_paz_salvo, i.direccion]) if (v) t = t.split(v).join('[INMUEBLE]');
  }
  return t.replace(/\b\d{1,3}(\.\d{3}){2,3}\b/g, '[DOCUMENTO]').replace(/\b\d{15,30}\b/g, '[CATASTRAL]').slice(0, 2000);
}

export async function registrarCorreccion(c: {
  expedienteId: string; tipoId: string; categoria: 'EXTRACCION' | 'OBSERVACION' | 'BORRADOR' | 'REVISION';
  campo?: string; valorIA?: unknown; valorCorregido?: unknown; motivo?: string; creadoPorId: string; datos?: DatosExpediente;
}) {
  const sensible = c.campo ? CAMPOS_SENSIBLES.test(c.campo) : true;
  await db.correccion.create({
    data: {
      expedienteId: c.expedienteId, tipoId: c.tipoId, categoria: c.categoria,
      campo: c.campo?.replace(/^(persona|inmueble|catastral):[^.]+\./, '$1.') ?? null, // sin el identificador real
      valorIA: c.valorIA === undefined ? null : sensible ? enmascarar(c.valorIA) : String(c.valorIA).slice(0, 200),
      valorCorregido: c.valorCorregido === undefined ? null : sensible ? enmascarar(c.valorCorregido) : String(c.valorCorregido).slice(0, 200),
      motivo: c.motivo ? anonimizarTexto(c.motivo, c.datos) : null,
      creadoPorId: c.creadoPorId,
    },
  });
}

/** Precios de referencia por millón de tokens (USD) para estimar el consumo; ajustables en el código de configuración */
export const PRECIOS_MODELOS: Record<string, { entrada: number; salida: number; cache: number }> = {
  'claude-opus-5-5': { entrada: 4, salida: 20, cache: 0.2 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10, cache: 0.2 },
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5, cache: 0.01 },
  'claude-fable-5-1': { entrada: 10, salida: 50, cache: 0.25 },
};

export function costoEstimadoUSD(modelo: string, entrada: number, salida: number, cache: number): number {
  const p = PRECIOS_MODELOS[modelo] ?? PRECIOS_MODELOS['claude-opus-5-5'];
  return (entrada * p.entrada + salida * p.salida + cache * p.cache) / 1_000_000;
}

/** Indicadores mensuales del entrenamiento */
export async function indicadoresMes(anio: number, mes: number) {
  const desde = new Date(anio, mes - 1, 1);
  const hasta = new Date(anio, mes, 1);
  const rango = { gte: desde, lt: hasta };
  const [datos, observaciones, aprobados, devoluciones, analisis, correccionesPorTipo] = await Promise.all([
    db.datoExtraido.groupBy({ by: ['estado'], where: { creadoEn: rango }, _count: true }),
    db.observacion.findMany({ where: { resueltaEn: rango }, select: { origen: true, estado: true, falsaAlarma: true, nivel: true, codigo: true } }),
    db.expediente.findMany({ where: { aprobadoEn: rango }, select: { creadoEn: true, aprobadoEn: true, tipoId: true } }),
    db.auditoria.count({ where: { accion: 'EXPEDIENTE_DEVUELTO', fecha: rango } }),
    db.analisisIA.findMany({ where: { creadoEn: rango }, select: { modelo: true, tokensEntrada: true, tokensSalida: true, tokensCacheLectura: true, proposito: true } }),
    db.correccion.groupBy({ by: ['tipoId', 'categoria', 'campo'], where: { creadoEn: rango }, _count: true, orderBy: { _count: { campo: 'desc' } }, take: 30 }),
  ]);
  const cuenta = (e: string) => datos.find((d) => d.estado === e)?._count ?? 0;
  const revisados = cuenta('ACEPTADO') + cuenta('CORREGIDO') + cuenta('DESCARTADO');
  const resueltas = observaciones.filter((o) => o.falsaAlarma !== null);
  const falsas = resueltas.filter((o) => o.falsaAlarma === true).length;
  const horas = aprobados.map((a) => (a.aprobadoEn!.getTime() - a.creadoEn.getTime()) / 3_600_000);
  return {
    periodo: `${anio}-${String(mes).padStart(2, '0')}`,
    datosExtraidos: { revisados, sinCorreccion: cuenta('ACEPTADO'), porcentajeSinCorreccion: revisados ? Math.round((cuenta('ACEPTADO') / revisados) * 1000) / 10 : null },
    observaciones: { resueltas: resueltas.length, acertadas: resueltas.length - falsas, falsasAlarmas: falsas, porcentajeAcierto: resueltas.length ? Math.round(((resueltas.length - falsas) / resueltas.length) * 1000) / 10 : null },
    escrituras: { aprobadas: aprobados.length, horasPromedio: horas.length ? Math.round((horas.reduce((a, b) => a + b, 0) / horas.length) * 10) / 10 : null, devueltas: devoluciones },
    api: {
      llamadas: analisis.length,
      tokensEntrada: analisis.reduce((s, a) => s + a.tokensEntrada, 0),
      tokensSalida: analisis.reduce((s, a) => s + a.tokensSalida, 0),
      costoUSD: Math.round(analisis.reduce((s, a) => s + costoEstimadoUSD(a.modelo, a.tokensEntrada, a.tokensSalida, a.tokensCacheLectura), 0) * 100) / 100,
    },
    patrones: correccionesPorTipo.map((c) => ({ tipo: c.tipoId, categoria: c.categoria, campo: c.campo, veces: c._count })),
  };
}
