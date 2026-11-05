/**
 * Registro de los actos por plantilla (src/lib/escritura/actos-plantilla.ts): cada tipo de
 * escritura sin formulario propio que tenga una plantilla APROBADA queda disponible como acto. La
 * plantilla es su modelo de redacción (la IA redacta sobre ella, no se llenan variables). Se
 * actualiza solo: al aprobar una versión nueva, el acto pasa a usarla; al retirarla, deja de ofrecerse.
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
    select: { id: true, tipoId: true, version: true, tipo: { select: { id: true, nombre: true, categoria: true } } },
  });
  const vigentes = new Map<string, (typeof aprobadas)[number]>();
  for (const a of aprobadas) if (!TIPOS_CON_FORMULARIO_PROPIO.has(a.tipoId) && !vigentes.has(a.tipoId)) vigentes.set(a.tipoId, a);

  for (const tipoId of [...registradas.keys()]) {
    if (vigentes.has(tipoId)) continue;
    delete ESQUEMAS[tipoId];
    delete ACTOS[tipoId];
    registradas.delete(tipoId);
  }
  for (const [tipoId, p] of vigentes) {
    if (registradas.get(tipoId) === p.id) continue;
    const { esquema, acto } = actoDesdePlantilla(p.tipo, { id: p.id, version: p.version });
    ESQUEMAS[tipoId] = esquema;
    ACTOS[tipoId] = acto;
    registradas.set(tipoId, p.id);
  }
}
