/**
 * Borra del almacenamiento los archivos cifrados del sistema anterior (documentos de los expedientes,
 * borradores y revisiones de escrituras). Se ejecuta ANTES de la migración 20261111120000_biblioteca_plantillas,
 * que elimina esas tablas: después ya no se sabría qué archivos eran. La auditoría no se toca.
 *
 * Uso: npx tsx --tsconfig tsconfig.scripts.json --env-file=.env scripts/limpiar-sistema-anterior.ts [--confirmar]
 * Sin --confirmar solo muestra lo que se borraría.
 */
import { db } from '../src/lib/db';
import { borrarCifrado } from '../src/lib/almacenamiento';

async function columnas(tabla: string): Promise<string[]> {
  const filas = await db.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${tabla}`;
  return filas.map((f) => f.column_name);
}

async function rutas(tabla: string, campos: string[]): Promise<string[]> {
  const existentes = await columnas(tabla);
  const usar = campos.filter((c) => existentes.includes(c));
  if (!usar.length) return [];
  const filas = await db.$queryRawUnsafe<Record<string, string | null>[]>(`SELECT ${usar.map((c) => `"${c}"`).join(', ')} FROM "${tabla}"`);
  return filas.flatMap((f) => usar.map((c) => f[c]).filter((x): x is string => !!x));
}

async function principal() {
  // La tabla documentos del sistema anterior tiene «tipoDocumental»; la nueva no
  const docsAnteriores = (await columnas('documentos')).includes('tipoDocumental');
  if (!docsAnteriores && !(await columnas('borradores')).length && !(await columnas('revisiones_escritura')).length) {
    console.log('No quedan tablas del sistema anterior: nada que limpiar (la migración ya se aplicó).');
    return;
  }
  const lista = [
    ...(docsAnteriores ? await rutas('documentos', ['rutaCifrada']) : []),
    ...(await rutas('borradores', ['rutaDocxCifrada', 'rutaPdfCifrada'])),
    ...(await rutas('revisiones_escritura', ['rutaOriginal', 'rutaBase', 'rutaCorregida'])),
  ];
  const expedientes = (await columnas('expedientes')).includes('tipoId') ? Number((await db.$queryRawUnsafe<{ n: bigint }[]>('SELECT count(*) AS n FROM "expedientes"'))[0].n) : 0;
  console.log(`Expedientes del sistema anterior: ${expedientes}. Archivos cifrados por borrar: ${lista.length}.`);
  if (!process.argv.includes('--confirmar')) return console.log('Nada borrado. Ejecute de nuevo con --confirmar y después aplique la migración (npx prisma migrate deploy).');
  let fallidos = 0;
  for (const [i, r] of lista.entries()) {
    await borrarCifrado(r).catch(() => { fallidos++; });
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1} de ${lista.length}…`);
  }
  console.log(`Borrados ${lista.length - fallidos} archivo(s).${fallidos ? ` No se pudieron borrar ${fallidos}.` : ''} Ahora aplique la migración: npx prisma migrate deploy`);
}

principal().then(() => db.$disconnect(), async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
