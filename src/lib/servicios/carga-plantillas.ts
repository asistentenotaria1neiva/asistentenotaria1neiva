/**
 * Carga de una versión de plantilla, de principio a fin:
 *   1. Valida el .docx.
 *   2. Si es un caso real, la IA lo convierte en plantilla (variabilizar-plantilla.ts).
 *   3. Guarda la versión, pendiente de aprobación, y la audita.
 *   4. La verificación automática y la revisión de la IA (revision-plantillas.ts).
 * La usan la carga de una versión (acción) y la de varias a la vez (api/plantillas/cargar), que
 * manda una petición por archivo para que los análisis corran en paralelo.
 * También la conversión de versiones ya cargadas que siguen con datos reales (api/plantillas/convertir).
 */
import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from '../db';
import { auditar } from '../auditoria';
import { sha256 } from '../seguridad/cifrado';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { ErrorIA } from '../ia/cliente';
import { cargarPlantilla, validarDocxPlantilla, ErrorPlantilla } from './plantillas';
import { variabilizarPlantilla, type Variabilizacion } from './variabilizar-plantilla';
import { revisarPlantilla, type Veredicto } from './revision-plantillas';

export interface ResultadoCarga {
  id: string;
  version: number;
  tipo: string;
  /** Resumen de la conversión del caso real; null si no se pidió o no hay IA */
  conversion: { esCasoReal: boolean; reemplazos: number; noAplicados: number; error: string | null } | null;
  veredicto: Veredicto | null;
  errorIA: string | null;
}

export async function cargarYRevisarPlantilla(s: SesionActiva, entrada: { tipoId: string; nombreArchivo: string; archivo: Buffer; notas?: string; convertir: boolean; otros?: Buffer[] }): Promise<ResultadoCarga> {
  const tipo = await db.tipoEscritura.findUnique({ where: { id: entrada.tipoId } });
  if (!tipo) throw new ErrorPlantilla('Tipo de escritura no válido.');
  const v = validarDocxPlantilla(entrada.archivo);
  if (!v.ok) throw new ErrorPlantilla(v.error);
  const otros = entrada.otros ?? [];
  if (otros.some((o) => o.subarray(0, 2).toString() !== 'PK')) throw new ErrorPlantilla('Uno de los otros archivos no es un .docx válido.');

  let archivo = entrada.archivo;
  let variabilizacion: Variabilizacion | null = null;
  if (entrada.convertir && process.env.ANTHROPIC_API_KEY) {
    try {
      const r = await variabilizarPlantilla(tipo, archivo, { otros });
      archivo = r.archivo;
      variabilizacion = r.variabilizacion;
    } catch (e) {
      // Sin conversión la plantilla se carga tal como vino; la revisión de la IA señalará los datos fijos
      if (!(e instanceof ErrorIA)) console.error('[carga-plantillas] conversión', e);
      variabilizacion = { esCasoReal: false, resumen: '', reemplazos: [], noAplicados: [], nuevas: [], advertencias: [], valoresEjemplo: {}, modelo: '', duracionMs: 0,
        error: e instanceof ErrorIA ? e.message : 'Error inesperado al convertir el caso real en plantilla.' };
    }
  }

  const p = await cargarPlantilla(tipo.id, entrada.nombreArchivo, archivo, s.usuario.id, entrada.notas, (variabilizacion ?? undefined) as Prisma.InputJsonValue | undefined);
  const convertida = !!variabilizacion?.reemplazos.length;
  await auditar({
    ...datosAuditoria(s), accion: 'PLANTILLA_CARGADA', entidad: 'plantilla', entidadId: p.id,
    detalle: {
      tipoId: tipo.id, version: p.version, sha256: p.hashSha256,
      ...(variabilizacion ? { conversion: { casoReal: variabilizacion.esCasoReal, reemplazos: variabilizacion.reemplazos.length, error: variabilizacion.error, otrosCasos: otros.length } } : {}),
      // Si se convirtió, también queda la huella del archivo tal como se cargó
      ...(convertida ? { sha256Original: sha256(entrada.archivo) } : {}),
    },
  });

  // La revisión no impide la carga: si la IA falla, el error queda en la versión y se puede repetir
  const revision = await revisarPlantilla(p.id, s).catch((e) => { console.error('[carga-plantillas] revisión', e); return null; });
  return {
    id: p.id, version: p.version, tipo: tipo.nombre,
    conversion: variabilizacion && { esCasoReal: variabilizacion.esCasoReal, reemplazos: variabilizacion.reemplazos.length, noAplicados: variabilizacion.noAplicados.length, error: variabilizacion.error },
    veredicto: revision?.ia?.veredicto ?? null,
    errorIA: revision ? revision.errorIA : 'No se pudo completar la revisión.',
  };
}

export interface ResultadoConversion {
  /** Versión nueva con los datos cambiados por variables; null si la IA no encontró datos que cambiar */
  nueva: ResultadoCarga | null;
  desde: number;
  mensaje: string;
  /** Datos que siguen escritos y hay que cambiar en Word */
  noAplicados: { dato: string; motivo: string }[];
}

/**
 * Convierte una versión ya cargada que todavía tiene datos de un caso real: la IA cambia los datos
 * por variables y queda una versión NUEVA (sin datos, con sus valores de ejemplo ficticios),
 * pendiente de aprobación y revisada por la IA. La versión original no cambia.
 */
export async function convertirPlantillaCargada(s: SesionActiva, id: string): Promise<ResultadoConversion> {
  const p = await db.plantilla.findUnique({ where: { id }, include: { tipo: true } });
  if (!p) throw new ErrorPlantilla('La plantilla no existe.');
  if (p.estado === 'RETIRADA') throw new ErrorPlantilla('La versión está retirada.');
  if (!process.env.ANTHROPIC_API_KEY) throw new ErrorPlantilla('La IA no está configurada.');
  const original = Buffer.from(p.archivo);
  let r: Awaited<ReturnType<typeof variabilizarPlantilla>>;
  try {
    r = await variabilizarPlantilla(p.tipo, original, { excluir: p.id });
  } catch (e) {
    if (e instanceof ErrorIA) throw new ErrorPlantilla(`La IA no respondió: ${e.message}`);
    throw e;
  }
  const v = r.variabilizacion;
  if (!v.reemplazos.length) {
    // Queda registrado en la versión: ya se intentó, así que deja de aparecer entre las pendientes
    await db.plantilla.update({ where: { id: p.id }, data: { variabilizacion: v as unknown as Prisma.InputJsonValue } });
    await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_CONVERSION_SIN_CAMBIOS', entidad: 'plantilla', entidadId: p.id, detalle: { tipoId: p.tipoId, version: p.version, casoReal: v.esCasoReal, noAplicados: v.noAplicados.length } });
    return {
      nueva: null, desde: p.version, noAplicados: v.noAplicados,
      mensaje: !v.esCasoReal ? 'La IA no encontró datos de un caso real: la plantilla ya está bien.'
        : v.noAplicados.length ? `La IA encontró ${v.noAplicados.length} dato(s), pero no pudo cambiarlos solos: corríjalos en Word y cargue la versión.`
          : 'La IA no pudo cambiar los datos automáticamente: corríjalos en Word.',
    };
  }

  // Los valores ficticios de la conversión anterior (si la hubo) se conservan y se completan con los nuevos
  const previos = (p.variabilizacion as Variabilizacion | null)?.valoresEjemplo ?? {};
  v.valoresEjemplo = { ...previos, ...v.valoresEjemplo };
  const notas = `Datos del caso real cambiados por variables con la IA, a partir de la v${p.version}.${p.notas ? `\n${p.notas}` : ''}`;
  const nueva = await cargarPlantilla(p.tipoId, p.nombreArchivo, r.archivo, s.usuario.id, notas.slice(0, 4000), v as unknown as Prisma.InputJsonValue);
  await auditar({
    ...datosAuditoria(s), accion: 'PLANTILLA_CARGADA', entidad: 'plantilla', entidadId: nueva.id,
    detalle: { tipoId: p.tipoId, version: nueva.version, sha256: nueva.hashSha256, origen: 'conversion_caso_real', desde: p.version, conversion: { reemplazos: v.reemplazos.length, noAplicados: v.noAplicados.length } },
  });
  const revision = await revisarPlantilla(nueva.id, s).catch((e) => { console.error('[carga-plantillas] revisión', e); return null; });
  return {
    desde: p.version,
    noAplicados: v.noAplicados,
    mensaje: `${v.reemplazos.length} dato(s) cambiados por variables en la v${nueva.version}${v.noAplicados.length ? `; ${v.noAplicados.length} siguen escritos (cámbielos en Word)` : ''}.`,
    nueva: {
      id: nueva.id, version: nueva.version, tipo: p.tipo.nombre,
      conversion: { esCasoReal: true, reemplazos: v.reemplazos.length, noAplicados: v.noAplicados.length, error: null },
      veredicto: revision?.ia?.veredicto ?? null,
      errorIA: revision ? revision.errorIA : 'No se pudo completar la revisión.',
    },
  };
}
