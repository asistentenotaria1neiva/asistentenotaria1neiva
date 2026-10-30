/**
 * Carga como versión nueva la plantilla construida en plantillas/docx/<tipo>.docx (npm run plantillas:construir)
 * y, con --aprobar, la deja APROBADA (las aprobadas anteriores del tipo quedan RETIRADAS, como en Plantillas).
 * No hace nada si el archivo es idéntico a la última versión cargada.
 *
 * Uso: npx tsx --tsconfig tsconfig.scripts.json --env-file=.env scripts/actualizar-plantilla.ts <tipo> [--aprobar]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { db } from '../src/lib/db';

async function principal() {
  const tipoId = process.argv[2];
  if (!tipoId || tipoId.startsWith('--')) throw new Error('Indique el tipo de plantilla, p. ej. compraventa.');
  const nombreArchivo = `${tipoId}.docx`;
  const archivo = fs.readFileSync(path.resolve(__dirname, '..', 'plantillas', 'docx', nombreArchivo));
  const hash = createHash('sha256').update(archivo).digest('hex');
  const ultima = await db.plantilla.findFirst({ where: { tipoId }, orderBy: { version: 'desc' } });
  const aprobada = await db.plantilla.findFirst({ where: { tipoId, estado: 'APROBADA' }, orderBy: { version: 'desc' } });
  console.log(`${tipoId}: última versión v${ultima?.version ?? '-'} (${ultima?.estado ?? 'sin versiones'}); aprobada v${aprobada?.version ?? '-'}.`);
  if (ultima?.hashSha256 === hash) return console.log('El archivo es idéntico a la última versión: nada que cargar.');

  const nueva = await db.plantilla.create({
    data: { tipoId, version: (ultima?.version ?? 0) + 1, nombreArchivo, archivo: new Uint8Array(archivo), hashSha256: hash,
      notas: 'Versión reconstruida desde plantillas/fuentes con las correcciones de redacción del borrador.' },
  });
  console.log(`Cargada ${tipoId} v${nueva.version} (PENDIENTE_APROBACION).`);
  if (!process.argv.includes('--aprobar')) return;
  await db.$transaction([
    db.plantilla.updateMany({ where: { tipoId, estado: 'APROBADA', id: { not: nueva.id } }, data: { estado: 'RETIRADA' } }),
    db.plantilla.update({ where: { id: nueva.id }, data: { estado: 'APROBADA', aprobadaEn: new Date() } }),
  ]);
  console.log(`Aprobada ${tipoId} v${nueva.version}; la v${aprobada?.version ?? '-'} queda retirada.`);
}

principal().then(() => db.$disconnect(), async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
