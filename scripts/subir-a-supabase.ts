/**
 * Pasa a Supabase Storage los archivos cifrados que quedaron en la carpeta local (RUTA_ALMACENAMIENTO)
 * porque se cargaron sin SUPABASE_URL / SUPABASE_CLAVE_SERVICIO en el .env. Los archivos van tal cual
 * (ya cifrados con CLAVE_MAESTRA, que debe ser la MISMA que la de Vercel) y en la misma ruta, así que la
 * base de datos no cambia.
 *
 * Con --limpiar-anterior borra también del bucket los archivos del sistema anterior (borradores/,
 * revisiones/ y los documentos/ que ninguna escritura actual usa).
 *
 * Uso: npx tsx --tsconfig tsconfig.scripts.json --env-file=.env scripts/subir-a-supabase.ts [--confirmar] [--limpiar-anterior]
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

async function subir(ruta: string, datos: Buffer) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${ruta}`, { method: 'POST', body: new Uint8Array(datos), headers: { ...cabeceras(), 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' } });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
}

/** Objetos del bucket bajo un prefijo (recorre las subcarpetas de dos letras) */
async function listar(prefijo: string): Promise<string[]> {
  const pedir = async (p: string) => {
    const salida: { name: string; id: string | null }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const r = await fetch(`${URL_BASE}/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: { ...cabeceras(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: p, limit: 1000, offset }) });
      if (!r.ok) throw new Error(`Listar ${p}: ${r.status}`);
      const lote = (await r.json()) as { name: string; id: string | null }[];
      salida.push(...lote);
      if (lote.length < 1000) return salida;
    }
  };
  const rutas: string[] = [];
  for (const sub of await pedir(prefijo)) {
    if (sub.id) { rutas.push(`${prefijo}/${sub.name}`); continue; }
    for (const o of await pedir(`${prefijo}/${sub.name}`)) if (o.id) rutas.push(`${prefijo}/${sub.name}/${o.name}`);
  }
  return rutas;
}

async function borrar(rutas: string[]) {
  for (let i = 0; i < rutas.length; i += 100) {
    const r = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { ...cabeceras(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: rutas.slice(i, i + 100) }) });
    if (!r.ok) throw new Error(`Borrar: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
}

async function principal() {
  if (!URL_BASE || !CLAVE) throw new Error('Defina SUPABASE_URL y SUPABASE_CLAVE_SERVICIO en el .env (las mismas de Vercel).');
  const [plantillas, documentos, generaciones, personales] = await Promise.all([
    db.plantilla.findMany({ select: { rutaCifrada: true } }),
    db.documento.findMany({ select: { rutaCifrada: true } }),
    db.generacion.findMany({ where: { rutaDocx: { not: null } }, select: { rutaDocx: true } }),
    db.expediente.findMany({ where: { plantillaRuta: { not: null } }, select: { plantillaRuta: true } }),
  ]);
  const usadas = [...plantillas.map((p) => p.rutaCifrada), ...documentos.map((d) => d.rutaCifrada), ...generaciones.map((g) => g.rutaDocx!), ...personales.map((e) => e.plantillaRuta!)];
  const locales: string[] = [];
  for (const r of usadas) if (await fs.stat(path.join(RAIZ, r)).then(() => true, () => false)) locales.push(r);
  console.log(`Archivos en la base: ${usadas.length}. En la carpeta local, por subir: ${locales.length}.`);

  let subidos = 0;
  const cola = [...locales];
  if (confirmar) {
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (cola.length) {
        const r = cola.shift()!;
        await subir(r, await fs.readFile(path.join(RAIZ, r)));
        if (++subidos % 200 === 0) console.log(`  ${subidos} subidos…`);
      }
    }));
    console.log(`Subidos ${subidos} archivo(s) a Supabase.`);
  }

  if (process.argv.includes('--limpiar-anterior')) {
    const enUso = new Set(usadas);
    const huerfanos = [...await listar('borradores'), ...await listar('revisiones'), ...(await listar('documentos')).filter((r) => !enUso.has(r))];
    console.log(`Archivos del sistema anterior en el bucket: ${huerfanos.length}.`);
    if (confirmar && huerfanos.length) { await borrar(huerfanos); console.log(`Borrados ${huerfanos.length}.`); }
  }
  if (!confirmar) console.log('Nada cambiado. Ejecute de nuevo con --confirmar.');
}

principal().then(() => db.$disconnect(), async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
