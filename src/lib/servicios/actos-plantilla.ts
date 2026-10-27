/**
 * Registro de los actos por plantilla (src/lib/escritura/actos-plantilla.ts): cada tipo de
 * escritura sin formulario propio que tenga una plantilla APROBADA queda disponible como acto,
 * con el formulario armado desde las variables de esa plantilla. Se actualiza solo: al aprobar una
 * versión nueva, su formulario reemplaza al anterior; al retirarla, el acto deja de ofrecerse.
 * Cada plantilla se lee una sola vez por instancia del servidor.
 */
import 'server-only';
import { db } from '../db';
import { ESQUEMAS, TIPOS_CON_FORMULARIO_PROPIO } from '../escritura/esquemas';
import { ACTOS } from '../escritura/actos';
import { actoDesdePlantilla } from '../escritura/actos-plantilla';

/** Tipo → versión de plantilla registrada */
const registradas = new Map<string, string>();

export async function cargarActosDePlantillas() {
  const aprobadas = await db.plantilla.findMany({
    where: { estado: 'APROBADA', tipo: { esBloque: false, activo: true } },
    orderBy: { version: 'desc' },
    select: { id: true, tipoId: true },
  });
  const vigentes = new Map<string, string>();
  for (const a of aprobadas) if (!TIPOS_CON_FORMULARIO_PROPIO.has(a.tipoId) && !vigentes.has(a.tipoId)) vigentes.set(a.tipoId, a.id);

  for (const tipoId of [...registradas.keys()]) {
    if (vigentes.has(tipoId)) continue;
    delete ESQUEMAS[tipoId];
    delete ACTOS[tipoId];
    registradas.delete(tipoId);
  }
  const nuevas = [...vigentes].filter(([tipoId, id]) => registradas.get(tipoId) !== id).map(([, id]) => id);
  if (!nuevas.length) return;
  const plantillas = await db.plantilla.findMany({ where: { id: { in: nuevas } }, include: { tipo: true } });
  for (const p of plantillas) {
    try {
      const { esquema, acto } = actoDesdePlantilla(p.tipo, Buffer.from(p.archivo), { id: p.id, version: p.version });
      ESQUEMAS[p.tipoId] = esquema;
      ACTOS[p.tipoId] = acto;
      registradas.set(p.tipoId, p.id);
    } catch (e) {
      console.error(`[actos-plantilla] no se pudo leer la plantilla de ${p.tipoId}`, e);
    }
  }
}
