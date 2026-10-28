/**
 * Elimina TODOS los expedientes (de prueba) con sus documentos, análisis, datos extraídos,
 * observaciones, borradores y correcciones (en cascada), y borra sus archivos cifrados del
 * almacenamiento. La auditoría no se toca: es inmodificable (ver model Auditoria).
 *
 * Uso: npx tsx --tsconfig tsconfig.scripts.json --env-file=.env scripts/eliminar-expedientes.ts [--confirmar]
 * Sin --confirmar solo muestra lo que se eliminaría.
 */
import { db } from '../src/lib/db';
import { borrarCifrado } from '../src/lib/almacenamiento';

async function principal() {
  const expedientes = await db.expediente.findMany({ select: { id: true, numeroInterno: true } });
  const documentos = await db.documento.findMany({ select: { rutaCifrada: true } });
  const borradores = await db.borrador.findMany({ select: { rutaDocxCifrada: true, rutaPdfCifrada: true } });
  const rutas = [...documentos.map((d) => d.rutaCifrada), ...borradores.flatMap((b) => [b.rutaDocxCifrada, b.rutaPdfCifrada ?? []].flat())];
  console.log(`Expedientes: ${expedientes.length} (${expedientes.map((e) => e.numeroInterno).join(', ') || 'ninguno'})`);
  console.log(`Archivos cifrados: ${documentos.length} documento(s), ${borradores.length} borrador(es), ${rutas.length} archivo(s) en total`);
  if (!process.argv.includes('--confirmar')) return console.log('Nada eliminado. Ejecute de nuevo con --confirmar para eliminar.');

  const r = await db.expediente.deleteMany({});
  let fallidos = 0;
  for (const ruta of rutas) await borrarCifrado(ruta).catch(() => { fallidos++; });
  console.log(`Eliminados ${r.count} expediente(s) y ${rutas.length - fallidos} archivo(s).${fallidos ? ` No se pudieron borrar ${fallidos} archivo(s).` : ''}`);
}

principal().then(() => db.$disconnect(), async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
