/**
 * Copia a la carpeta local (RUTA_ALMACENAMIENTO) todos los archivos cifrados del bucket de Supabase, para
 * dejar de usar Supabase Storage. Los archivos se bajan tal cual (ya cifrados con CLAVE_MAESTRA, que debe
 * seguir siendo la MISMA) y en la misma ruta relativa, así que la base de datos no cambia. Incluye las
 * piezas («.bin.1», «.bin.2»…) de los archivos grandes. Lo que ya está en la carpeta con el mismo tamaño
 * no se vuelve a bajar: se puede repetir sin costo.
 *
 * Al final, si hay DATABASE_URL, compara contra la base y lista las rutas que faltan en la carpeta.
 *
 * Uso (las variables de Supabase en un archivo aparte, p. ej. .env.supabase):
 *   npx tsx --tsconfig tsconfig.scripts.json --env-file=.env --env-file=.env.supabase scripts/bajar-de-supabase.ts [--confirmar]
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const CLAVE = process.env.SUPABASE_CLAVE_SERVICIO;
const BUCKET = process.env.SUPABASE_BUCKET ?? 'documentos';
const RAIZ = path.resolve(process.env.RUTA_ALMACENAMIENTO ?? './almacenamiento');
const PREFIJOS = ['plantillas', 'documentos', 'escrituras'];
const confirmar = process.argv.includes('--confirmar');
const cabeceras = () => ({ apikey: CLAVE!, Authorization: `Bearer ${CLAVE}` });

type Objeto = { ruta: string; tamano: number | null };

/** Supabase responde 429 (too_many_connections) si se le pide mucho seguido: se espera y se repite */
async function conReintentos<T>(que: string, fn: () => Promise<T>): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      return await fn();
    } catch (e) {
      if (intento >= 6) throw new Error(`${que}: ${(e as Error).message}`);
      await new Promise((res) => setTimeout(res, 2000 * 2 ** (intento - 1)));
    }
  }
}

/** Objetos del bucket bajo un prefijo (recorre las subcarpetas de dos letras) */
async function listar(prefijo: string): Promise<Objeto[]> {
  const pedir = async (p: string) => {
    const salida: { name: string; id: string | null; metadata?: { size?: number } | null }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const lote = await conReintentos(`Listar ${p}`, async () => {
        const r = await fetch(`${URL_BASE}/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: { ...cabeceras(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: p, limit: 1000, offset }) });
        if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
        return (await r.json()) as typeof salida;
      });
      salida.push(...lote);
      if (lote.length < 1000) return salida;
    }
  };
  const objetos: Objeto[] = [];
  for (const sub of await pedir(prefijo)) {
    if (sub.id) { objetos.push({ ruta: `${prefijo}/${sub.name}`, tamano: sub.metadata?.size ?? null }); continue; }
    for (const o of await pedir(`${prefijo}/${sub.name}`)) if (o.id) objetos.push({ ruta: `${prefijo}/${sub.name}/${o.name}`, tamano: o.metadata?.size ?? null });
  }
  return objetos;
}

async function bajar(ruta: string): Promise<Buffer> {
  return conReintentos(`Bajar ${ruta}`, async () => {
    const r = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${ruta}`, { headers: cabeceras(), signal: AbortSignal.timeout(300_000) });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    return Buffer.from(await r.arrayBuffer());
  });
}

async function tamanoLocal(ruta: string): Promise<number | null> {
  return fs.stat(path.join(RAIZ, ruta)).then((s) => s.size, () => null);
}

async function compararConBase() {
  if (!process.env.DATABASE_URL) return;
  const { db } = await import('../src/lib/db');
  try {
    const [plantillas, documentos, generaciones, personales] = await Promise.all([
      db.plantilla.findMany({ select: { rutaCifrada: true } }),
      db.documento.findMany({ select: { rutaCifrada: true } }),
      db.generacion.findMany({ where: { rutaDocx: { not: null } }, select: { rutaDocx: true } }),
      db.expediente.findMany({ where: { plantillaRuta: { not: null } }, select: { plantillaRuta: true } }),
    ]);
    const usadas = [...plantillas.map((p) => p.rutaCifrada), ...documentos.map((d) => d.rutaCifrada), ...generaciones.map((g) => g.rutaDocx!), ...personales.map((e) => e.plantillaRuta!)]
      .filter((r) => r !== 'retirado');
    const faltan: string[] = [];
    for (const r of usadas) if ((await tamanoLocal(r)) === null) faltan.push(r);
    console.log(`Base de datos: ${usadas.length} archivo(s) referenciados; faltan en la carpeta local: ${faltan.length}.`);
    for (const r of faltan.slice(0, 20)) console.log(`  falta ${r}`);
  } finally {
    await db.$disconnect();
  }
}

async function principal() {
  if (!URL_BASE || !CLAVE) throw new Error('Defina SUPABASE_URL y SUPABASE_CLAVE_SERVICIO (las mismas que tenía Vercel).');
  console.log(`Carpeta local: ${RAIZ}`);
  const objetos: Objeto[] = [];
  for (const p of PREFIJOS) objetos.push(...await listar(p));
  const pendientes: Objeto[] = [];
  for (const o of objetos) {
    const local = await tamanoLocal(o.ruta);
    if (local === null || (o.tamano !== null && local !== o.tamano)) pendientes.push(o);
  }
  const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;
  const total = pendientes.reduce((s, o) => s + (o.tamano ?? 0), 0);
  console.log(`En el bucket: ${objetos.length} archivo(s). Por bajar: ${pendientes.length} (${mb(total)}).`);

  if (confirmar && pendientes.length) {
    let bajados = 0;
    const cola = [...pendientes];
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (cola.length) {
        const o = cola.shift()!;
        const datos = await bajar(o.ruta);
        const destino = path.join(RAIZ, o.ruta);
        await fs.mkdir(path.dirname(destino), { recursive: true });
        await fs.writeFile(`${destino}.tmp`, datos, { mode: 0o600 });
        await fs.rename(`${destino}.tmp`, destino); // sin archivos a medias si se corta
        if (++bajados % 100 === 0) console.log(`  ${bajados} de ${pendientes.length}…`);
      }
    }));
    console.log(`Bajados ${bajados} archivo(s).`);
  }
  if (!confirmar) console.log('Nada copiado. Ejecute de nuevo con --confirmar.');
  await compararConBase();
}

principal().catch((e) => { console.error(e); process.exit(1); });
