/**
 * Carga una carpeta de escrituras modelo (.docx) como VARIANTES de un tipo de escritura, todas
 * PENDIENTES DE APROBACIÓN (las aprueba el administrador en Plantillas, por indicación del notario;
 * se pueden aprobar en bloque desde la página del tipo). El tipo debe admitir variantes.
 * Omite los archivos idénticos a una versión ya cargada del tipo. Cada carga queda en la auditoría.
 *
 * Con --criterios <archivo.json> cada archivo recibe su nombre de variante y cuándo usarla:
 *   { "<nombre del archivo.docx>": { "variante": "Banco de Bogotá · San Telmo", "criterios": "…" } }
 * Sin él, la variante se llama como el archivo y la IA se guía por la carátula del modelo.
 *
 * Uso: npx tsx --tsconfig tsconfig.scripts.json --env-file=.env scripts/cargar-variantes.ts <tipo> <carpeta> [--criterios archivo.json] [--prueba]
 *   --prueba: muestra lo que cargaría, sin escribir en la base.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { db } from '../src/lib/db';
import { auditar } from '../src/lib/auditoria';
import { validarDocxPlantilla } from '../src/lib/servicios/plantillas';

type Criterios = Record<string, { variante?: string; criterios?: string; notas?: string }>;

async function principal() {
  const [tipoId, carpeta] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
  const i = process.argv.indexOf('--criterios');
  const prueba = process.argv.includes('--prueba');
  if (!tipoId || !carpeta) throw new Error('Uso: cargar-variantes.ts <tipo> <carpeta> [--criterios archivo.json] [--prueba]');
  const nfc = (x: string) => x.normalize('NFC');
  const criterios: Criterios = i > 0 ? Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8')) as Criterios).map(([k, v]) => [nfc(k), v])) : {};
  const tipo = await db.tipoEscritura.findUnique({ where: { id: tipoId } });
  if (!tipo) throw new Error(`No existe el tipo «${tipoId}».`);
  // Un tipo sin variantes recibe cada archivo como versión nueva (al aprobar una, las demás quedan retiradas)
  if (!tipo.variantes) console.log(`Aviso: «${tipoId}» no admite variantes; cada archivo será una versión nueva de su única plantilla.`);

  const existentes = await db.plantilla.findMany({ where: { tipoId }, select: { hashSha256: true, variante: true, version: true } });
  const hashes = new Set(existentes.map((e) => e.hashSha256));
  const nombres = new Set(existentes.map((e) => e.variante?.toLowerCase()).filter(Boolean));
  let version = Math.max(0, ...existentes.map((e) => e.version));
  const archivos = fs.readdirSync(carpeta).filter((f) => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$')).sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));
  let cargadas = 0;
  for (const nombreArchivo of archivos) {
    const archivo = fs.readFileSync(path.join(carpeta, nombreArchivo));
    const v = validarDocxPlantilla(archivo);
    if (!v.ok) { console.log(`✗ ${nombreArchivo}: ${v.error}`); continue; }
    const hash = createHash('sha256').update(archivo).digest('hex');
    if (hashes.has(hash)) { console.log(`= ${nombreArchivo}: ya está cargado.`); continue; }
    const c = criterios[nfc(nombreArchivo)] ?? {};
    const variante = tipo.variantes ? (c.variante?.trim() || nombreArchivo.replace(/\.docx$/i, '')).slice(0, 120) : null;
    if (variante && nombres.has(variante.toLowerCase())) { console.log(`✗ ${nombreArchivo}: ya existe una variante «${variante}» (cámbiele el nombre en el JSON).`); continue; }
    if (variante) nombres.add(variante.toLowerCase());
    hashes.add(hash);
    version++;
    if (prueba) { console.log(`+ v${version} «${variante ?? nombreArchivo}» ← ${nombreArchivo}${c.criterios ? `\n    ${c.criterios}` : ''}`); continue; }
    const p = await db.plantilla.create({
      data: { tipoId, version, nombreArchivo: nombreArchivo.slice(0, 120), archivo: new Uint8Array(archivo), hashSha256: hash, variante, criterios: tipo.variantes ? c.criterios?.trim().slice(0, 2000) || null : null,
        notas: c.notas ?? 'Variante cargada desde la carpeta de modelos de la notaría (scripts/cargar-variantes.ts).' },
    });
    await auditar({ usuarioId: null, usuarioNombre: 'script cargar-variantes', accion: 'PLANTILLA_CARGADA', entidad: 'plantilla', entidadId: p.id, detalle: { tipoId, version, sha256: hash, ...(variante ? { variante } : {}) } });
    cargadas++;
    console.log(`+ v${version} «${variante ?? nombreArchivo}» (pendiente de aprobación)`);
  }
  console.log(prueba ? '\nPrueba: no se escribió nada.' : `\n${cargadas} variante(s) cargada(s), pendientes de aprobación.`);
}

principal().then(() => db.$disconnect(), async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
