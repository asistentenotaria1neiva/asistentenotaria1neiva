/**
 * Migración al servidor local: baja TODOS los archivos del bucket de Supabase a la carpeta local
 * (RUTA_ALMACENAMIENTO), en la misma ruta y tal cual (siguen cifrados con CLAVE_MAESTRA, que debe ser la
 * MISMA del servidor), así que la base de datos no cambia. Se puede repetir: solo baja lo que falta o
 * cambió de tamaño. Al final comprueba que cada archivo que nombra la base de datos esté en la carpeta.
 *
 * Uso (en el servidor, con SUPABASE_URL, SUPABASE_CLAVE_SERVICIO y DATABASE_URL de la base YA restaurada):
 *   npx tsx --tsconfig tsconfig.scripts.json --env-file=.env scripts/bajar-de-supabase.ts [--confirmar]
 * Sin --confirmar solo muestra lo que bajaría. Después de migrar, quite SUPABASE_URL y
 * SUPABASE_CLAVE_SERVICIO del .env: sin ellas la aplicación usa la carpeta local.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../src/lib/db';

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const CLAVE = process.env.SUPABASE_CLAVE_SERVICIO;
const BUCKET = process.env.SUPABASE_BUCKET ?? 'documentos';
const RAIZ = path.resolve(process.env.RUTA_ALMACENAMIENTO ?? './almacenamiento');
const confirmar = process.argv.includes('--confirmar');
const cabeceras = () => ({ apikey: CLAVE!, Authorization: `Bearer ${CLAVE}` });
const MB = 1024 * 1024;

interface Objeto { ruta: string; tam: number }

async function listar(prefijo: string): Promise<Objeto[]> {
  const salida: Objeto[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${URL_BASE}/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: { ...cabeceras(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: prefijo, limit: 1000, offset }) });
    if (!r.ok) throw new Error(`Listar ${prefijo}: ${r.status} ${await r.text()}`);
    const lote = (await r.json()) as { name: string; id: string | null; metadata?: { size?: number } | null }[];
    for (const o of lote) {
      const ruta = prefijo ? `${prefijo}/${o.name}` : o.name;
      if (o.id === null) salida.push(...(await listar(ruta)));
      else salida.push({ ruta, tam: o.metadata?.size ?? -1 });
    }
    if (lote.length < 1000) return salida;
  }
}

async function bajar(o: Objeto) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${o.ruta}`, { headers: cabeceras() });
  if (!r.ok) throw new Error(`${o.ruta}: ${r.status}`);
  const datos = Buffer.from(await r.arrayBuffer());
  const destino = path.join(RAIZ, o.ruta);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  // Primero a un temporal: un corte a medio bajar no deja un archivo dañado con el nombre bueno
  await fs.writeFile(`${destino}.parcial`, datos);
  await fs.rename(`${destino}.parcial`, destino);
}

async function principal() {
  if (!URL_BASE || !CLAVE) throw new Error('Defina SUPABASE_URL y SUPABASE_CLAVE_SERVICIO en el .env (las mismas de Vercel) solo durante la migración.');
  const objetos = (await listar('')).filter((o) => !o.ruta.startsWith('partes/')); // restos de subidas a medias
  const faltan: Objeto[] = [];
  for (const o of objetos) {
    const local = await fs.stat(path.join(RAIZ, o.ruta)).catch(() => null);
    if (!local || (o.tam >= 0 && local.size !== o.tam)) faltan.push(o);
  }
  const total = objetos.reduce((a, o) => a + Math.max(0, o.tam), 0);
  console.log(`Bucket: ${objetos.length} archivos, ${(total / MB).toFixed(0)} MB. Carpeta: ${RAIZ}`);
  console.log(`Por bajar: ${faltan.length} archivos, ${(faltan.reduce((a, o) => a + Math.max(0, o.tam), 0) / MB).toFixed(0)} MB.`);

  if (confirmar && faltan.length) {
    let hechos = 0, fallidos = 0;
    const cola = [...faltan];
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (cola.length) {
        const o = cola.shift()!;
        await bajar(o).catch((e) => { fallidos++; console.error('  ', e.message); });
        if (++hechos % 200 === 0) console.log(`  ${hechos} de ${faltan.length}…`);
      }
    }));
    console.log(`Bajados ${hechos - fallidos}.${fallidos ? ` Fallaron ${fallidos}: ejecute de nuevo (solo baja lo que falta).` : ''}`);
  }

  // ¿Está cada archivo que nombra la base?
  const [plantillas, documentos, generaciones, personales] = await Promise.all([
    db.plantilla.findMany({ select: { rutaCifrada: true } }),
    db.documento.findMany({ select: { rutaCifrada: true } }),
    db.generacion.findMany({ where: { rutaDocx: { not: null } }, select: { rutaDocx: true } }),
    db.expediente.findMany({ where: { plantillaRuta: { not: null } }, select: { plantillaRuta: true } }),
  ]);
  const usadas = [...plantillas.map((p) => p.rutaCifrada), ...documentos.map((d) => d.rutaCifrada), ...generaciones.map((g) => g.rutaDocx!), ...personales.map((e) => e.plantillaRuta!)].filter((r) => r !== 'retirado');
  const ausentes: string[] = [];
  for (const r of usadas) if (!(await fs.stat(path.join(RAIZ, r)).then(() => true, () => false))) ausentes.push(r);
  console.log(`Archivos que nombra la base: ${usadas.length}. En la carpeta: ${usadas.length - ausentes.length}.${ausentes.length ? ` FALTAN ${ausentes.length} (p. ej. ${ausentes.slice(0, 3).join(', ')}).` : ' Están todos.'}`);
  if (!confirmar) console.log('Nada bajado. Ejecute de nuevo con --confirmar.');
}

principal().then(() => db.$disconnect(), async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
