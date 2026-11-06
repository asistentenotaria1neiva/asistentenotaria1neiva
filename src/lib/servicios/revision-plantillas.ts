/**
 * Revisión de plantillas antes de la aprobación del notario. La plantilla es el MODELO DE REDACCIÓN
 * de un tipo de escritura (una escritura de la notaría que la IA toma como base para redactar cada
 * caso): no lleva variables ni se llena.
 *   1. Verificación automática: tamaño del texto y comparación con la versión aprobada.
 *   2. Revisión de la IA: que sea del tipo, que esté completa como modelo (partes del acto), su
 *      redacción y los cambios frente a la versión aprobada.
 * El resultado se guarda en la versión (plantillas.revision). La IA solo advierte: la aprobación
 * sigue siendo del administrador por indicación del notario.
 */
import 'server-only';
import type { Plantilla, Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { vistaPreviaDocx, textoDeParrafos } from '../escritura/vista-previa';
import { llamarEstructurado, ErrorIA } from '../ia/cliente';
import { SISTEMA_REVISION_PLANTILLA, ESQUEMA_REVISION_PLANTILLA } from '../ia/instrucciones';

export type NivelHallazgo = 'CRITICA' | 'ADVERTENCIA' | 'INFORMATIVA';
export type Veredicto = 'APTA' | 'APTA_CON_OBSERVACIONES' | 'NO_APTA';

export interface HallazgoPlantilla {
  nivel: NivelHallazgo;
  /** VARIABLES y DATO_FIJO quedan en revisiones anteriores al cambio a modelos de redacción */
  categoria: 'TIPO' | 'REDACCION' | 'CONTENIDO' | 'CAMBIO' | 'FORMATO' | 'VARIABLES' | 'DATO_FIJO';
  mensaje: string;
  fragmento: string | null;
}

export interface VerificacionAutomatica {
  comparadaCon: number | null; // versión aprobada contra la que se comparó
  parrafos?: number;
  palabras?: number;
  /** Párrafos que cambiaron frente a la versión aprobada (agregados + retirados) */
  parrafosCambiados?: number;
}

export interface RevisionPlantilla {
  automatica: VerificacionAutomatica;
  ia: { veredicto: Veredicto; resumen: string; cambios: string[]; hallazgos: HallazgoPlantilla[]; modelo: string; duracionMs: number } | null;
  errorIA: string | null;
  revisadaPor: string;
  /** Corrección con IA de los hallazgos (src/lib/servicios/correccion-plantillas.ts) */
  correccion?: CorreccionPlantilla;
  /** Inicio (ISO) de una revisión de la IA que corre en segundo plano; se borra al terminar */
  revisando?: string;
}

export interface PropuestaPlantilla {
  hallazgo: number; // índice en ia.hallazgos
  original: string;
  corregido: string;
  explicacion: string;
  estado: 'PENDIENTE' | 'APLICADA' | 'DESCARTADA';
}

export interface CorreccionPlantilla {
  estado: 'EN_CURSO' | 'COMPLETADA' | 'ERROR';
  iniciadaEn: string;
  hallazgos: number[];
  propuestas: PropuestaPlantilla[];
  sinCorreccion: { hallazgo: number; motivo: string }[];
  error?: string;
  /** Versión creada al aplicar las propuestas */
  nuevaVersionId?: string;
}

const LIMITE_TEXTO = 80_000; // caracteres por texto enviado a la IA

/** Texto del modelo (un párrafo por línea), para la IA */
export const textoDePlantilla = (archivo: Buffer | Uint8Array) => textoDeParrafos(vistaPreviaDocx(Buffer.from(archivo)));

async function verificar(p: Pick<Plantilla, 'id' | 'tipoId' | 'archivo'>) {
  const texto = textoDePlantilla(p.archivo);
  const aprobada = await db.plantilla.findFirst({ where: { tipoId: p.tipoId, estado: 'APROBADA', id: { not: p.id } }, orderBy: { version: 'desc' } });
  const textoAprobada = aprobada ? textoDePlantilla(aprobada.archivo) : null;
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  let parrafosCambiados: number | undefined;
  if (textoAprobada) {
    const previas = new Set(textoAprobada.split('\n').map((l) => l.trim()).filter(Boolean));
    const actuales = new Set(lineas);
    parrafosCambiados = lineas.filter((l) => !previas.has(l)).length + [...previas].filter((l) => !actuales.has(l)).length;
  }
  const automatica: VerificacionAutomatica = {
    comparadaCon: aprobada?.version ?? null, parrafos: lineas.length, palabras: texto.split(/\s+/).filter(Boolean).length, parrafosCambiados,
  };
  return { automatica, texto, textoAprobada };
}

function solicitud(p: Pick<Plantilla, 'version' | 'nombreArchivo' | 'notas'> & { tipo: { id: string; nombre: string; categoria: string; esBloque: boolean; descripcion: string | null; normas: string | null } }, v: Awaited<ReturnType<typeof verificar>>): string {
  return [
    `TIPO: ${p.tipo.nombre} (${p.tipo.id}) · ${p.tipo.esBloque ? 'bloque común de las escrituras de compraventa (carátula, cierre u oficios)' : p.tipo.categoria}`,
    p.tipo.descripcion && `Descripción: ${p.tipo.descripcion}`,
    p.tipo.normas && `Referencia normativa registrada (pendiente de validar por el notario): ${p.tipo.normas}`,
    `VERSIÓN EN REVISIÓN: ${p.version} (archivo ${p.nombreArchivo})`,
    p.notas && `Notas de quien la cargó: ${p.notas}`,
    v.automatica.comparadaCon ? `Frente a la versión aprobada ${v.automatica.comparadaCon} cambiaron ${v.automatica.parrafosCambiados ?? 0} párrafo(s).` : 'No hay versión aprobada con la cual comparar.',
    '',
    `<plantilla_en_revision>\n${v.texto.slice(0, LIMITE_TEXTO)}\n</plantilla_en_revision>`,
    v.textoAprobada && `<plantilla_aprobada_vigente version="${v.automatica.comparadaCon}">\n${v.textoAprobada.slice(0, LIMITE_TEXTO)}\n</plantilla_aprobada_vigente>`,
  ].filter((x): x is string => typeof x === 'string').join('\n');
}

/** Una revisión en curso más antigua que esto se da por interrumpida (p. ej., el servidor se reinició) */
const LIMITE_REVISION_MS = 10 * 60 * 1000;

/** La IA está revisando esta versión en segundo plano */
export const enRevision = (revision: RevisionPlantilla | null | undefined) =>
  !!revision?.revisando && Date.now() - new Date(revision.revisando).getTime() < LIMITE_REVISION_MS;

/**
 * Deja la revisión EN CURSO y devuelve `tarea`, que la acción programa para después de responder:
 * así el usuario puede salir de la página mientras la IA revisa. Si la versión nunca se había
 * revisado, la verificación automática (rápida) queda de una vez.
 */
export async function iniciarRevisionPlantilla(id: string, s: SesionActiva) {
  const p = await db.plantilla.findUniqueOrThrow({ where: { id }, include: { tipo: true } });
  const previa = p.revision as RevisionPlantilla | null;
  if (enRevision(previa)) throw new ErrorRevision('La IA ya está revisando esta versión. Espere a que termine.');
  const base: RevisionPlantilla = previa ?? { automatica: (await verificar(p)).automatica, ia: null, errorIA: null, revisadaPor: s.usuario.nombre };
  await db.plantilla.update({ where: { id }, data: { revision: { ...base, revisando: new Date().toISOString() } as unknown as Prisma.InputJsonValue } });
  const tarea = async () => {
    try {
      await revisarPlantilla(id, s);
    } catch (e) {
      console.error('[revision-plantillas] revisión en segundo plano', e);
      const actual = await db.plantilla.findUnique({ where: { id } });
      const r = actual?.revision as RevisionPlantilla | null;
      if (r) await db.plantilla.update({ where: { id }, data: { revision: { ...r, revisando: undefined, errorIA: 'No se pudo completar la revisión. Pídala de nuevo.' } as unknown as Prisma.InputJsonValue } });
    }
  };
  return { tarea };
}

export class ErrorRevision extends Error {}

/** Verifica la versión y, si conIA, la hace revisar por la IA. Guarda y audita el resultado. */
export async function revisarPlantilla(id: string, s: SesionActiva, conIA = true): Promise<RevisionPlantilla> {
  const p = await db.plantilla.findUniqueOrThrow({ where: { id }, include: { tipo: true } });
  const v = await verificar(p);
  let ia: RevisionPlantilla['ia'] = null;
  let errorIA: string | null = null;
  if (conIA) {
    try {
      const r = await llamarEstructurado<Omit<NonNullable<RevisionPlantilla['ia']>, 'modelo' | 'duracionMs'>>({
        proposito: 'PLANTILLA',
        registro: { usuarioId: s.usuario.id, plantillaId: id },
        sistema: SISTEMA_REVISION_PLANTILLA,
        contenido: [{ type: 'text', text: solicitud(p, v) }],
        esquema: ESQUEMA_REVISION_PLANTILLA as unknown as Record<string, unknown>,
        maxTokens: 16000,
      });
      ia = { ...r.datos, modelo: r.modelo, duracionMs: r.duracionMs };
    } catch (e) {
      if (!(e instanceof ErrorIA)) console.error('[revision-plantillas]', e);
      errorIA = e instanceof ErrorIA ? e.message : 'No se pudo completar la revisión de la IA.';
    }
  }
  const revision: RevisionPlantilla = { automatica: v.automatica, ia, errorIA, revisadaPor: s.usuario.nombre };
  await db.plantilla.update({ where: { id }, data: { revision: revision as unknown as Prisma.InputJsonValue, revisadaEn: new Date() } });
  await auditar({
    ...datosAuditoria(s), accion: 'PLANTILLA_REVISADA', entidad: 'plantilla', entidadId: id,
    detalle: { tipoId: p.tipoId, version: p.version, veredicto: ia?.veredicto ?? null, hallazgos: ia?.hallazgos.length ?? null, errorIA },
  });
  return revision;
}
