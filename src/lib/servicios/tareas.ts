/**
 * Análisis en segundo plano, por etapas: el asistente (documentos + preguntas) y «Analizar pendientes».
 *
 * En Vercel cada invocación del servidor se corta a los 5 minutos (maxDuration), y analizar varios
 * documentos uno tras otro tarda más: la tarea moría a medias y los documentos quedaban «en curso».
 * Ahora la tarea avanza por etapas, cada una en su propia invocación:
 *   - DOCUMENTOS: hasta 3 documentos a la vez; pasado CORTE_MS no se empieza ninguno nuevo y la
 *     siguiente etapa se encadena con una petición firmada a /api/tareas.
 *   - EXPEDIENTE (solo el asistente): tipo de escritura, inconsistencias y preguntas.
 * El avance queda en analisis_ia.progreso (la página muestra el porcentaje y qué documento se
 * analiza) y cada cambio renueva actualizadoEn. Si deja de cambiar por LIMITE_SIN_LATIDO_MS (una
 * etapa se cortó o el encadenamiento falló), la página la reanuda: lo ya analizado no se repite y los
 * documentos que quedaron «en curso» se recuperan. Al terminar se notifica a quien la inició.
 */
import 'server-only';
import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { huellaToken } from '../seguridad/cifrado';
import type { SesionActiva } from '../sesion-tipos';
import { ErrorIA, configuracionModelo } from '../ia/cliente';
import { obtenerExpediente, puedeEditar, aplicarSugerenciasConfiables, retirarInmueblesSobrantes, ErrorNegocio } from './expedientes';
import { analizarDocumento } from './documentos';
import { buscarFaltantesEnDocumentos } from './busqueda';
import { prepararPreguntas } from './asistente';
import { notificar } from './notificaciones';

export type ClaseTarea = 'ASISTENTE' | 'DOCUMENTOS';

export interface ProgresoTarea {
  fase: 'DOCUMENTOS' | 'BUSQUEDA' | 'EXPEDIENTE';
  /** Documentos por analizar en esta tarea (crece si se cargan más mientras tanto) */
  total: number;
  hechos: number;
  analizando: { id: string; nombre: string }[];
  /** Documentos ya intentados en esta tarea: no se repiten aunque hayan fallado */
  intentados: string[];
  errores: string[];
  /** Cada etapa toma un turno; una invocación con un turno viejo no hace nada */
  turno: number;
  reanudaciones: number;
  /** El encadenamiento de la siguiente etapa falló: la página la reanuda sin esperar */
  sinEncadenar?: boolean;
  sesion: SesionActiva;
  base: string;
}

const CONCURRENCIA = 3;
/** Después de esto no se empieza otro documento en la etapa (cada análisis puede tardar ~3 minutos) */
const CORTE_MS = 90_000;
/** Sin cambios en este tiempo, la etapa se cortó (ninguna invocación dura más de 5 minutos) */
export const LIMITE_SIN_LATIDO_MS = 6 * 60_000;
const MAX_REANUDACIONES = 3;

const firma = (id: string, turno: number) => huellaToken(`tarea:${id}:${turno}`);
export function firmaValida(id: string, turno: number, recibida: string): boolean {
  const a = Buffer.from(firma(id, turno));
  const b = Buffer.from(String(recibida));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const mensajeDe = (e: unknown) => (e instanceof ErrorIA || e instanceof ErrorNegocio ? e.message : 'Error inesperado en el análisis.');

/**
 * Guarda el avance solo si el turno guardado sigue siendo `turnoEsperado` (por defecto, el de `p`).
 * Con un turno esperado distinto, reclama la tarea: pasa del turno anterior al de `p`.
 */
async function guardar(id: string, p: ProgresoTarea, turnoEsperado = p.turno): Promise<boolean> {
  const r = await db.analisisIA.updateMany({ where: { id, estado: 'EN_CURSO', progreso: { path: ['turno'], equals: turnoEsperado } }, data: { progreso: p as unknown as Prisma.InputJsonValue } });
  return r.count > 0;
}

/** Documentos que quedaron «en curso» porque su análisis se cortó: pasan a ERROR para reintentarlos */
export async function recuperarDocumentosTrabados(expedienteId: string): Promise<number> {
  const trabados = await db.documento.findMany({ where: { expedienteId, estadoAnalisis: 'EN_CURSO' }, select: { id: true } });
  let n = 0;
  for (const d of trabados) {
    const a = await db.analisisIA.findFirst({ where: { documentoId: d.id, proposito: 'EXTRACCION' }, orderBy: { creadoEn: 'desc' } });
    if (a?.estado === 'EN_CURSO' && Date.now() - a.actualizadoEn.getTime() < LIMITE_SIN_LATIDO_MS) continue;
    if (a?.estado === 'EN_CURSO') await db.analisisIA.update({ where: { id: a.id }, data: { estado: 'ERROR', error: 'El análisis se interrumpió antes de terminar.' } });
    await db.documento.update({ where: { id: d.id }, data: { estadoAnalisis: 'ERROR' } });
    n++;
  }
  return n;
}

/**
 * Deja la tarea EN_CURSO y devuelve la primera etapa, que la acción programa con after().
 * `base`: dirección de la aplicación para encadenar las etapas (urlAplicacion()).
 */
export async function iniciarTarea(s: SesionActiva, expedienteId: string, clase: ClaseTarea, base: string) {
  const e = await obtenerExpediente(s, expedienteId);
  if (!puedeEditar(s, e)) throw new ErrorNegocio('El expediente no se puede editar en su estado actual.');
  if (await tareaEnCurso(expedienteId)) throw new ErrorNegocio('Ya se están analizando los documentos de este expediente. Espere a que termine.');
  await recuperarDocumentosTrabados(expedienteId);
  const documentos = await db.documento.findMany({ where: { expedienteId }, select: { estadoAnalisis: true } });
  if (clase === 'ASISTENTE' && !documentos.length) throw new ErrorNegocio('Cargue al menos un documento antes de iniciar el asistente.');
  const pendientes = documentos.filter((d) => d.estadoAnalisis === 'PENDIENTE' || d.estadoAnalisis === 'ERROR').length;
  if (clase === 'DOCUMENTOS' && !pendientes) throw new ErrorNegocio('No hay documentos pendientes de análisis.');
  const progreso: ProgresoTarea = { fase: 'DOCUMENTOS', total: pendientes, hechos: 0, analizando: [], intentados: [], errores: [], turno: 0, reanudaciones: 0, sesion: s, base };
  const a = await db.analisisIA.create({
    data: { expedienteId, proposito: clase, modelo: configuracionModelo(clase === 'ASISTENTE' ? 'REVISION' : 'EXTRACCION').modelo, estado: 'EN_CURSO', progreso: progreso as unknown as Prisma.InputJsonValue },
  });
  return { documentos: pendientes, etapa: () => ejecutarEtapa(a.id, 0) };
}

/** Tarea en curso del expediente, con su avance para mostrarlo */
export async function tareaEnCurso(expedienteId: string) {
  const a = await db.analisisIA.findFirst({ where: { expedienteId, proposito: { in: ['ASISTENTE', 'DOCUMENTOS'] }, estado: 'EN_CURSO' }, orderBy: { creadoEn: 'desc' } });
  if (!a) return null;
  const p = a.progreso as ProgresoTarea | null;
  // Análisis iniciados antes de las etapas (sin progreso): solo se pueden dar por terminados
  if (!p) {
    if (Date.now() - a.actualizadoEn.getTime() < LIMITE_SIN_LATIDO_MS) return { id: a.id, clase: a.proposito as ClaseTarea, iniciada: a.creadoEn, porcentaje: 0, fase: 'DOCUMENTOS' as const, analizando: [], hechos: 0, total: 0 };
    await db.analisisIA.update({ where: { id: a.id }, data: { estado: 'ERROR', error: 'El análisis se interrumpió antes de terminar. Ejecútelo de nuevo.' } });
    return null;
  }
  const docs = p.total ? p.hechos / p.total : 1;
  return {
    id: a.id, clase: a.proposito as ClaseTarea, iniciada: a.creadoEn, fase: p.fase, analizando: p.analizando.map((x) => x.nombre), hechos: p.hechos, total: p.total,
    // En el asistente los documentos son el 80 %, la búsqueda de lo que falta y las preguntas el resto
    porcentaje: Math.round(a.proposito === 'ASISTENTE' ? (p.fase === 'EXPEDIENTE' ? 92 : p.fase === 'BUSQUEDA' ? 85 : docs * 80) : docs * 100),
  };
}

/**
 * Si la tarea dejó de avanzar, devuelve la etapa con la que se reanuda (la página la programa con
 * after()); si ya se reanudó demasiadas veces, la da por fallida. null si no hay nada que hacer.
 */
export async function tareaPorReanudar(expedienteId: string): Promise<(() => Promise<void>) | null> {
  const a = await db.analisisIA.findFirst({ where: { expedienteId, proposito: { in: ['ASISTENTE', 'DOCUMENTOS'] }, estado: 'EN_CURSO' }, orderBy: { creadoEn: 'desc' } });
  const p = a?.progreso as ProgresoTarea | null | undefined;
  if (!a || !p) return null;
  const quieta = Date.now() - a.actualizadoEn.getTime();
  if (quieta < LIMITE_SIN_LATIDO_MS && !(p.sinEncadenar && quieta > 15_000)) return null;
  if (p.reanudaciones >= MAX_REANUDACIONES) {
    await terminarConError(a.id, a.expedienteId, a.proposito as ClaseTarea, p, 'El análisis se interrumpió varias veces. Ejecútelo de nuevo; lo ya analizado no se repite.');
    return null;
  }
  // La reanudación toma un turno nuevo: la etapa cortada, si siguiera viva, ya no escribe
  const turno = p.turno;
  const siguiente: ProgresoTarea = { ...p, turno: turno + 1, reanudaciones: p.reanudaciones + 1, sinEncadenar: false, analizando: [] };
  if (!(await guardar(a.id, siguiente, turno))) return null;
  await recuperarDocumentosTrabados(expedienteId);
  return () => ejecutarEtapa(a.id, turno + 1);
}

async function terminarConError(id: string, expedienteId: string, clase: ClaseTarea, p: ProgresoTarea, mensaje: string) {
  const r = await db.analisisIA.updateMany({ where: { id, estado: 'EN_CURSO' }, data: { estado: 'ERROR', error: mensaje } });
  if (!r.count) return;
  const e = await db.expediente.findUnique({ where: { id: expedienteId }, select: { numeroInterno: true } });
  await notificar(p.sesion.usuario.id, {
    titulo: `El análisis no se completó · ${e?.numeroInterno ?? ''}`,
    mensaje: mensaje,
    enlace: `/expedientes/${expedienteId}/${clase === 'ASISTENTE' ? 'asistente' : 'documentos'}`,
  });
}

/** Pide a la aplicación que ejecute la siguiente etapa en una invocación nueva (con su propio límite de tiempo) */
async function encadenar(id: string, p: ProgresoTarea) {
  try {
    const r = await fetch(`${p.base}/api/tareas`, {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, turno: p.turno, firma: firma(id, p.turno) }),
    });
    if (!r.ok) throw new Error(`respondió ${r.status}`);
  } catch (e) {
    console.error('[tareas] no se pudo encadenar la siguiente etapa; la página la reanudará', e);
    await guardar(id, { ...p, sinEncadenar: true });
  }
}

/** Analiza documentos pendientes, varios a la vez, hasta CORTE_MS. true si quedan por analizar. */
async function analizarLote(id: string, expedienteId: string, p: ProgresoTarea, s: SesionActiva): Promise<boolean> {
  const inicio = Date.now();
  const cola = await db.documento.findMany({
    where: { expedienteId, estadoAnalisis: { in: ['PENDIENTE', 'ERROR'] }, id: { notIn: p.intentados } },
    orderBy: { creadoEn: 'asc' }, select: { id: true, nombreOriginal: true },
  });
  p.total = p.hechos + cola.length;
  await guardar(id, p);
  const trabajador = async () => {
    while (cola.length && Date.now() - inicio < CORTE_MS) {
      const d = cola.shift()!;
      p.analizando.push({ id: d.id, nombre: d.nombreOriginal });
      if (!(await guardar(id, p))) return; // otra invocación tomó la tarea
      try {
        // Un PDF con varios documentos se separa en partes: se analizan en esta misma tarea
        const { partes } = await analizarDocumento(s, d.id);
        if (partes.length) {
          cola.push(...await db.documento.findMany({ where: { id: { in: partes } }, orderBy: { creadoEn: 'asc' }, select: { id: true, nombreOriginal: true } }));
          p.total += partes.length;
        }
      } catch (err) { p.errores.push(`${d.nombreOriginal}: ${mensajeDe(err)}`); }
      p.analizando = p.analizando.filter((x) => x.id !== d.id);
      p.intentados.push(d.id);
      p.hechos++;
      await guardar(id, p);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
  return cola.length > 0;
}

/** Ejecuta una etapa de la tarea. La llaman la acción (primera etapa), /api/tareas y la reanudación. */
export async function ejecutarEtapa(id: string, turno: number): Promise<void> {
  const a = await db.analisisIA.findUnique({ where: { id } });
  const previo = a?.progreso as ProgresoTarea | null | undefined;
  if (!a || a.estado !== 'EN_CURSO' || !previo || previo.turno !== turno) return;
  const p: ProgresoTarea = { ...previo, turno: turno + 1 };
  if (!(await guardar(id, p, turno))) return; // reclama el turno (otra invocación ya lo tomó)
  const clase = a.proposito as ClaseTarea;
  try {
    const usuario = await db.usuario.findUnique({ where: { id: p.sesion.usuario.id }, select: { estado: true } });
    if (usuario?.estado !== 'ACTIVO') throw new ErrorNegocio('El usuario que inició el análisis ya no está activo.');

    if (p.fase === 'DOCUMENTOS') {
      if (await analizarLote(id, a.expedienteId, p, p.sesion)) return encadenar(id, p);
      if (clase === 'ASISTENTE') {
        p.fase = 'BUSQUEDA';
        await guardar(id, p);
        return encadenar(id, p); // cada llamada a la IA puede tardar: etapa propia
      }
      const r = await db.analisisIA.updateMany({ where: { id, estado: 'EN_CURSO' }, data: { estado: 'COMPLETADO', progreso: p as unknown as Prisma.InputJsonValue } });
      if (!r.count) return;
      const e = await db.expediente.findUnique({ where: { id: a.expedienteId }, select: { numeroInterno: true } });
      await notificar(p.sesion.usuario.id, {
        titulo: `Documentos analizados · ${e?.numeroInterno ?? ''}`,
        mensaje: `Se analizaron ${p.hechos - p.errores.length} de ${p.hechos} documento(s).${p.errores.length ? ` No se pudieron analizar: ${p.errores.length}.` : ''}`,
        enlace: `/expedientes/${a.expedienteId}/documentos`,
      });
      return;
    }

    if (p.fase === 'BUSQUEDA') {
      // Antes de preguntar, lo que quedó vacío se busca en los documentos; si falla, se pregunta como antes
      try {
        await aplicarSugerenciasConfiables(p.sesion, a.expedienteId);
        await retirarInmueblesSobrantes(p.sesion, a.expedienteId);
        await buscarFaltantesEnDocumentos(p.sesion, a.expedienteId);
      } catch (err) {
        if (!(err instanceof ErrorIA) && !(err instanceof ErrorNegocio)) console.error('[tareas] búsqueda en los documentos', err);
        p.errores.push(`Búsqueda de los datos que faltan: ${mensajeDe(err)}`);
      }
      p.fase = 'EXPEDIENTE';
      await guardar(id, p);
      return encadenar(id, p);
    }

    const r = await prepararPreguntas(p.sesion, a.expedienteId, id, p.errores);
    await notificar(p.sesion.usuario.id, {
      titulo: r.obligatoriasPendientes || !r.actosConfirmados ? `Documentos analizados · ${r.numeroInterno}` : `Escritura lista para generar · ${r.numeroInterno}`,
      mensaje: [
        `La IA analizó ${p.hechos} documento(s)${p.errores.length ? ` (${p.errores.length} con error)` : ''}.`,
        !r.actosConfirmados ? 'Confirme el tipo de escritura y responda las preguntas.'
          : r.obligatoriasPendientes ? `Faltan ${r.obligatoriasPendientes} pregunta(s) obligatoria(s) para completar la escritura.`
          : 'Ya tiene todos los datos obligatorios: puede generar el borrador.',
      ].join(' '),
      enlace: `/expedientes/${a.expedienteId}/asistente`,
    });
  } catch (err) {
    if (!(err instanceof ErrorIA) && !(err instanceof ErrorNegocio)) console.error('[tareas]', err);
    await terminarConError(id, a.expedienteId, clase, p, mensajeDe(err));
  }
}
