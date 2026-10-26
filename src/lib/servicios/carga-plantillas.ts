/**
 * Carga de una versión de plantilla, de principio a fin:
 *   1. Valida el .docx.
 *   2. Si es un caso real, la IA lo convierte en plantilla (variabilizar-plantilla.ts).
 *   3. Guarda la versión, pendiente de aprobación, y la audita.
 *   4. La verificación automática y la revisión de la IA (revision-plantillas.ts).
 * La usan la carga de una versión (acción) y la de varias a la vez (api/plantillas/cargar), que
 * manda una petición por archivo para que los análisis corran en paralelo.
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

export async function cargarYRevisarPlantilla(s: SesionActiva, entrada: { tipoId: string; nombreArchivo: string; archivo: Buffer; notas?: string; convertir: boolean }): Promise<ResultadoCarga> {
  const tipo = await db.tipoEscritura.findUnique({ where: { id: entrada.tipoId } });
  if (!tipo) throw new ErrorPlantilla('Tipo de escritura no válido.');
  const v = validarDocxPlantilla(entrada.archivo);
  if (!v.ok) throw new ErrorPlantilla(v.error);

  let archivo = entrada.archivo;
  let variabilizacion: Variabilizacion | null = null;
  if (entrada.convertir && process.env.ANTHROPIC_API_KEY) {
    try {
      const r = await variabilizarPlantilla(tipo, archivo);
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
      ...(variabilizacion ? { conversion: { casoReal: variabilizacion.esCasoReal, reemplazos: variabilizacion.reemplazos.length, error: variabilizacion.error } } : {}),
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
