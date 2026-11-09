/**
 * Carga de una versión de plantilla, de principio a fin:
 *   1. Valida el .docx.
 *   2. Guarda la versión, pendiente de aprobación, y la audita.
 *   3. La verificación automática (revision-plantillas.ts). La revisión de la IA no corre al cargar:
 *      se pide después desde la versión.
 * La plantilla es el modelo de redacción del tipo de escritura: se guarda tal como viene (puede ser
 * una escritura real de la notaría). No se convierte en variables: la IA la toma como base para
 * redactar cada caso y nunca copia los datos del caso del modelo.
 * En un tipo con variantes, `variante` dice a cuál pertenece la versión: con `nuevaVariante` debe ser
 * un nombre que no exista; sin él, si el nombre existe es una versión nueva de esa variante (y hereda
 * sus criterios si no trae otros).
 * La usan la carga de una versión (acción) y la de varias a la vez (api/plantillas/cargar).
 */
import 'server-only';
import { db } from '../db';
import { auditar } from '../auditoria';
import { datosAuditoria, type SesionActiva } from '../sesion-tipos';
import { cargarPlantilla, validarDocxPlantilla, nombreVariante, ErrorPlantilla } from './plantillas';
import { revisarPlantilla } from './revision-plantillas';

export interface ResultadoCarga {
  id: string;
  version: number;
  tipo: string;
  variante?: string;
}

const clave = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export async function cargarYRevisarPlantilla(s: SesionActiva, entrada: { tipoId: string; nombreArchivo: string; archivo: Buffer; notas?: string; variante?: string; criterios?: string; nuevaVariante?: boolean }): Promise<ResultadoCarga> {
  const tipo = await db.tipoEscritura.findUnique({ where: { id: entrada.tipoId } });
  if (!tipo) throw new ErrorPlantilla('Tipo de escritura no válido.');
  const v = validarDocxPlantilla(entrada.archivo);
  if (!v.ok) throw new ErrorPlantilla(v.error);
  let variante: string | undefined;
  let criterios = entrada.criterios?.trim() || undefined;
  if (tipo.variantes) {
    variante = entrada.variante?.trim() || entrada.nombreArchivo.replace(/\.docx$/i, '');
    const existentes = await db.plantilla.findMany({ where: { tipoId: tipo.id }, orderBy: { version: 'desc' }, select: { variante: true, nombreArchivo: true, criterios: true } });
    const misma = existentes.find((x) => clave(nombreVariante(x)) === clave(variante!));
    if (misma && entrada.nuevaVariante) throw new ErrorPlantilla(`Ya existe la variante «${nombreVariante(misma)}». Para cambiarla, cargue una nueva versión desde su página; para agregar otra, use un nombre distinto.`);
    if (misma) variante = nombreVariante(misma); // se escribe igual que las demás versiones
    criterios ??= misma?.criterios ?? undefined;
  }
  const p = await cargarPlantilla(tipo.id, entrada.nombreArchivo, entrada.archivo, s.usuario.id, entrada.notas, { variante, criterios });
  await auditar({ ...datosAuditoria(s), accion: 'PLANTILLA_CARGADA', entidad: 'plantilla', entidadId: p.id, detalle: { tipoId: tipo.id, version: p.version, sha256: p.hashSha256, ...(variante ? { variante } : {}) } });
  await revisarPlantilla(p.id, s, false).catch((e) => { console.error('[carga-plantillas] verificación', e); return null; });
  return { id: p.id, version: p.version, tipo: tipo.nombre, ...(variante ? { variante } : {}) };
}
