/** Inventario de solo lectura del bucket de Supabase: tamaño por carpeta y archivos sin registro en la base. */
import { db } from '../../src/lib/db';

const URL_ = process.env.SUPABASE_URL!.replace(/\/+$/, '');
const CLAVE = process.env.SUPABASE_CLAVE_SERVICIO!;
const BUCKET = process.env.SUPABASE_BUCKET ?? 'documentos';

interface Item { name: string; id: string | null; created_at?: string; metadata?: { size?: number } | null }

async function listar(prefijo: string): Promise<{ ruta: string; tam: number; creado: string }[]> {
  const salida: { ruta: string; tam: number; creado: string }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${URL_}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: prefijo, limit: 1000, offset }),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const items = (await r.json()) as Item[];
    for (const it of items) {
      const ruta = prefijo ? `${prefijo}/${it.name}` : it.name;
      if (it.id === null) salida.push(...(await listar(ruta)));
      else salida.push({ ruta, tam: it.metadata?.size ?? 0, creado: it.created_at ?? '' });
    }
    if (items.length < 1000) break;
  }
  return salida;
}

async function principal() {
  const objetos = await listar('');
  const [docs, gens, plant] = await Promise.all([
    db.documento.findMany({ select: { rutaCifrada: true, expediente: { select: { eliminadoEn: true } } } }),
    db.generacion.findMany({ select: { rutaDocx: true, estado: true, expediente: { select: { eliminadoEn: true } } } }),
    db.plantilla.findMany({ select: { rutaCifrada: true, activa: true } }),
  ]);
  const usadas = new Map<string, string>();
  for (const d of docs) usadas.set(d.rutaCifrada, d.expediente.eliminadoEn ? 'documento (escritura eliminada)' : 'documento');
  for (const g of gens) if (g.rutaDocx) usadas.set(g.rutaDocx, g.expediente.eliminadoEn ? 'escritura generada (escritura eliminada)' : 'escritura generada');
  for (const p of plant) usadas.set(p.rutaCifrada, p.activa ? 'plantilla activa' : 'plantilla inactiva');

  const grupos = new Map<string, { n: number; tam: number }>();
  for (const o of objetos) {
    const base = o.ruta.replace(/\.bin\.\d{1,2}$/, '.bin');
    const carpeta = o.ruta.split('/')[0];
    const clase = usadas.get(base) ?? (carpeta === 'partes' ? 'partes de subida (temporales)' : 'SIN REGISTRO (huérfano)');
    const k = `${carpeta} · ${clase}`;
    const g = grupos.get(k) ?? { n: 0, tam: 0 };
    g.n++; g.tam += o.tam; grupos.set(k, g);
  }
  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
  console.log(`Total: ${objetos.length} objetos, ${mb(objetos.reduce((a, o) => a + o.tam, 0))}`);
  for (const [k, g] of [...grupos].sort((a, b) => b[1].tam - a[1].tam)) console.log(`${mb(g.tam).padStart(10)}  ${String(g.n).padStart(5)}  ${k}`);
  const expEliminados = await db.expediente.count({ where: { eliminadoEn: { not: null } } });
  const gensPorEstado = await db.generacion.groupBy({ by: ['estado'], _count: true });
  console.log(`Escrituras eliminadas (papelera): ${expEliminados}`);
  console.log('Generaciones por estado:', gensPorEstado.map((g) => `${g.estado}=${g._count}`).join(', '));
}

principal().then(() => db.$disconnect(), async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
