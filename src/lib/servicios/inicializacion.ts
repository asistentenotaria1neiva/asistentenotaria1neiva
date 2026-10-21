/**
 * Carga inicial idempotente (se ejecuta al arrancar el servidor):
 *   - catálogo de tipos de escritura (plantillas/catalogo.json, generado en la Fase 0);
 *   - plantillas .docx convertidas en la Fase 1 (versión 1, PENDIENTE DE APROBACIÓN);
 *   - esquemas de formulario (versión 1, PENDIENTE DE APROBACIÓN).
 * Nunca sobrescribe versiones existentes ni aprueba nada.
 */
import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../db';
import { sha256 } from '../seguridad/cifrado';
import { ESQUEMAS } from '../escritura/esquemas';

const RAIZ_PLANTILLAS = path.resolve(process.cwd(), 'plantillas');

export async function asegurarCatalogo(): Promise<{ tipos: number; plantillas: number; esquemas: number }> {
  let plantillas = 0;
  let esquemas = 0;
  const catalogo = JSON.parse(await fs.readFile(path.join(RAIZ_PLANTILLAS, 'catalogo.json'), 'utf8')) as
    { id: string; categoria: string; nombre: string; prioridad: string; esBloque: boolean; descripcion?: string }[];
  for (const t of catalogo) {
    await db.tipoEscritura.upsert({
      where: { id: t.id },
      create: { id: t.id, categoria: t.categoria, nombre: t.nombre, prioridad: t.prioridad, esBloque: t.esBloque, descripcion: t.descripcion,
        normas: 'Referencia normativa – pendiente de validar por el notario (ver docs/plantillas/fichas).' },
      update: {},
    });
  }
  const docx = (await fs.readdir(path.join(RAIZ_PLANTILLAS, 'docx'))).filter((f) => f.endsWith('.docx'));
  for (const f of docx) {
    const tipoId = f.replace(/\.docx$/, '');
    if (!catalogo.some((t) => t.id === tipoId)) continue;
    if (await db.plantilla.findFirst({ where: { tipoId } })) continue;
    const archivo = await fs.readFile(path.join(RAIZ_PLANTILLAS, 'docx', f));
    await db.plantilla.create({
      data: { tipoId, version: 1, nombreArchivo: f, archivo: new Uint8Array(archivo), hashSha256: sha256(archivo),
        notas: 'Versión 1 convertida en la Fase 1 a partir de las escrituras de la notaría. Pendiente de aprobación del notario.' },
    });
    plantillas++;
  }
  for (const e of Object.values(ESQUEMAS)) {
    if (await db.esquemaFormulario.findFirst({ where: { tipoId: e.tipo } })) continue;
    await db.esquemaFormulario.create({ data: { tipoId: e.tipo, version: e.version, esquema: e as unknown as object } });
    esquemas++;
  }
  return { tipos: catalogo.length, plantillas, esquemas };
}
