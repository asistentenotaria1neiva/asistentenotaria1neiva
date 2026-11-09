/**
 * Carga un .docx como versión nueva de la plantilla de un tipo y, con --aprobar, la deja APROBADA
 * (las aprobadas anteriores del tipo quedan RETIRADAS, como en Plantillas). Queda en la auditoría.
 * No hace nada si el archivo es idéntico a la última versión cargada.
 *
 * Uso: npx tsx --tsconfig tsconfig.scripts.json --env-file=.env scripts/cargar-plantilla.ts <tipo> <archivo.docx> [--aprobar] [--notas "…"]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { db } from '../src/lib/db';
import { auditar } from '../src/lib/auditoria';
import { validarDocxPlantilla } from '../src/lib/servicios/plantillas';

const QUIEN = 'script cargar-plantilla';

async function principal() {
  const [tipoId, ruta] = process.argv.slice(2);
  if (!tipoId || !ruta || tipoId.startsWith('--')) throw new Error('Uso: cargar-plantilla.ts <tipo> <archivo.docx> [--aprobar] [--notas "…"]');
  const i = process.argv.indexOf('--notas');
  const notas = i > 0 ? process.argv[i + 1] : undefined;
  const tipo = await db.tipoEscritura.findUnique({ where: { id: tipoId } });
  if (!tipo) throw new Error(`No existe el tipo de escritura «${tipoId}».`);
  const archivo = fs.readFileSync(path.resolve(ruta));
  const v = validarDocxPlantilla(archivo);
  if (!v.ok) throw new Error(v.error);
  const hash = createHash('sha256').update(archivo).digest('hex');
  const ultima = await db.plantilla.findFirst({ where: { tipoId }, orderBy: { version: 'desc' } });
  console.log(`${tipo.nombre}: última versión v${ultima?.version ?? '-'} (${ultima?.estado ?? 'sin versiones'}).`);
  if (ultima?.hashSha256 === hash) return console.log('El archivo es idéntico a la última versión: nada que cargar.');

  const nombreArchivo = path.basename(ruta).slice(0, 120);
  const nueva = await db.plantilla.create({
    data: { tipoId, version: (ultima?.version ?? 0) + 1, nombreArchivo, archivo: new Uint8Array(archivo), hashSha256: hash, notas },
  });
  await auditar({ usuarioId: null, usuarioNombre: QUIEN, accion: 'PLANTILLA_CARGADA', entidad: 'plantilla', entidadId: nueva.id, detalle: { tipoId, version: nueva.version, sha256: hash } });
  console.log(`Cargada ${tipoId} v${nueva.version} (PENDIENTE_APROBACION).`);
  if (!process.argv.includes('--aprobar')) return;
  const retiradas = await db.plantilla.updateMany({ where: { tipoId, estado: 'APROBADA', id: { not: nueva.id } }, data: { estado: 'RETIRADA' } });
  await db.plantilla.update({ where: { id: nueva.id }, data: { estado: 'APROBADA', aprobadaEn: new Date() } });
  await auditar({ usuarioId: null, usuarioNombre: QUIEN, accion: 'PLANTILLA_APROBADA', entidad: 'plantilla', entidadId: nueva.id, detalle: { tipoId, version: nueva.version, retiradas: retiradas.count } });
  console.log(`Aprobada ${tipoId} v${nueva.version}${retiradas.count ? `; ${retiradas.count} versión(es) aprobada(s) anterior(es) retirada(s)` : ''}.`);
}

principal().then(() => db.$disconnect(), async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
