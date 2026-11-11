/**
 * Carga la biblioteca de plantillas desde la carpeta de minutas de la notaría, organizada así:
 *   <carpeta>/<año>/<CATEGORÍA>/<archivo>.docx
 *   <carpeta>/<año>/<CATEGORÍA>/<SUBCATEGORÍA (banco…)>/<archivo>.docx
 * La categoría es la carpeta del acto, la subcategoría la carpeta dentro de ella (p. ej. el banco), el
 * año el de la carpeta y la fecha la de última modificación del archivo. Cada .docx se guarda cifrado;
 * los repetidos (mismo contenido) se cargan una sola vez. Se omiten los temporales de Word (~$…), los
 * .doc antiguos, los PDF y los demás archivos. Volver a ejecutarlo solo agrega lo nuevo.
 *
 * Uso: npx tsx --tsconfig tsconfig.scripts.json --env-file=.env scripts/cargar-biblioteca.ts "<carpeta>" [--confirmar] [--local]
 * Sin --confirmar solo muestra lo que se cargaría.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../src/lib/db';
import { guardarCifrado } from '../src/lib/almacenamiento';
import { prepararPlantilla } from '../src/lib/escritura/biblioteca';

interface Archivo { ruta: string; anio: number; categoria: string; subcategoria: string | null }

async function listar(raiz: string): Promise<{ archivos: Archivo[]; omitidos: string[] }> {
  const archivos: Archivo[] = [];
  const omitidos: string[] = [];
  const recorrer = async (dir: string, anio: number, categoria: string, subcategoria: string | null) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) { await recorrer(ruta, anio, categoria, subcategoria ? `${subcategoria} ${e.name}` : e.name); continue; }
      if (e.name.startsWith('~$')) continue;
      if (!/\.docx$/i.test(e.name)) { omitidos.push(path.relative(raiz, ruta)); continue; }
      archivos.push({ ruta, anio, categoria, subcategoria });
    }
  };
  for (const a of await fs.readdir(raiz, { withFileTypes: true })) {
    if (!a.isDirectory() || !/^\d{4}$/.test(a.name)) continue;
    for (const c of await fs.readdir(path.join(raiz, a.name), { withFileTypes: true })) {
      if (c.isDirectory()) await recorrer(path.join(raiz, a.name, c.name), Number(a.name), c.name, null);
      else omitidos.push(path.join(a.name, c.name));
    }
  }
  return { archivos, omitidos };
}

async function principal() {
  const raiz = process.argv.slice(2).find((x) => !x.startsWith('--'));
  if (!raiz) throw new Error('Indique la carpeta: scripts/cargar-biblioteca.ts "C:\\ruta\\milan" [--confirmar]');
  const confirmar = process.argv.includes('--confirmar');
  // Sin Supabase los archivos quedarían en la carpeta local y la aplicación publicada no los encontraría
  if (confirmar && !(process.env.SUPABASE_URL && process.env.SUPABASE_CLAVE_SERVICIO) && !process.argv.includes('--local')) {
    throw new Error('Defina SUPABASE_URL y SUPABASE_CLAVE_SERVICIO en el .env (las mismas de Vercel) o use --local para cargar solo en este equipo.');
  }
  const { archivos, omitidos } = await listar(path.resolve(raiz));
  const existentes = new Set((await db.plantilla.findMany({ select: { hashSha256: true } })).map((p) => p.hashSha256));
  console.log(`Archivos .docx: ${archivos.length}. Ya en la biblioteca: ${existentes.size}. Omitidos (no .docx): ${omitidos.length}.`);

  const porCategoria = new Map<string, number>();
  const errores: string[] = [];
  let nuevas = 0, repetidas = 0, hechas = 0;
  const cola = [...archivos];
  const trabajador = async () => {
    while (cola.length) {
      const a = cola.shift()!;
      try {
        const [bytes, info] = await Promise.all([fs.readFile(a.ruta), fs.stat(a.ruta)]);
        const p = prepararPlantilla(bytes, { nombreArchivo: path.basename(a.ruta), categoria: a.categoria, subcategoria: a.subcategoria, fecha: info.mtime, anio: a.anio });
        if (existentes.has(p.hashSha256)) { repetidas++; continue; }
        existentes.add(p.hashSha256);
        porCategoria.set(p.categoria, (porCategoria.get(p.categoria) ?? 0) + 1);
        nuevas++;
        if (confirmar) {
          const rutaCifrada = await guardarCifrado(bytes, 'plantillas');
          await db.plantilla.create({ data: { ...p, rutaCifrada, origen: 'CARGA_INICIAL' } });
          if (++hechas % 100 === 0) console.log(`  ${hechas} cargadas…`);
        }
      } catch (e) {
        errores.push(`${path.relative(raiz, a.ruta)}: ${(e as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: confirmar ? 6 : 12 }, trabajador));

  console.log(`\nNuevas: ${nuevas} · repetidas (mismo contenido): ${repetidas} · con error: ${errores.length}`);
  for (const [c, n] of [...porCategoria].sort((x, y) => x[0].localeCompare(y[0]))) console.log(`  ${c.padEnd(55)} ${n}`);
  if (omitidos.length) console.log(`\nOmitidos:\n  ${omitidos.join('\n  ')}`);
  if (errores.length) console.log(`\nErrores:\n  ${errores.join('\n  ')}`);
  console.log(confirmar ? `\nListo: ${hechas} plantilla(s) cargada(s) y cifrada(s).` : '\nNada cargado. Ejecute de nuevo con --confirmar para cargar.');
}

principal().then(() => db.$disconnect(), async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
