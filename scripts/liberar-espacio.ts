/**
 * Libera espacio en Supabase Storage (plan gratis: 1 GB):
 *   1. borra los restos de subidas (partes/…) de más de 24 horas y los archivos sin registro en la base;
 *   2. retira los PDF soporte ya leídos de escrituras con una versión terminada, de los más antiguos a
 *      los más nuevos, hasta que el total quede en --meta MB (700 por defecto). Lo que la IA leyó se
 *      conserva en la base (se puede generar de nuevo); el documento queda marcado «Archivo retirado».
 *
 * Uso: npx tsx --tsconfig tsconfig.scripts.json --env-file=.env scripts/liberar-espacio.ts [--meta 700] [--confirmar]
 * Sin --confirmar solo muestra lo que se borraría.
 */
import { db } from '../src/lib/db';
import { borrarCifrado, ARCHIVO_RETIRADO } from '../src/lib/almacenamiento';

const URL_ = process.env.SUPABASE_URL!.replace(/\/+$/, '');
const CLAVE = process.env.SUPABASE_CLAVE_SERVICIO!;
const BUCKET = process.env.SUPABASE_BUCKET ?? 'documentos';
const MB = 1024 * 1024;
const confirmar = process.argv.includes('--confirmar');
const iMeta = process.argv.indexOf('--meta');
const META = (iMeta > 0 ? Number(process.argv[iMeta + 1]) : 700) * MB;

interface Objeto { ruta: string; tam: number; creado: Date }

async function listar(prefijo: string): Promise<Objeto[]> {
  const salida: Objeto[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${URL_}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: prefijo, limit: 1000, offset }),
    });
    if (!r.ok) throw new Error(`Listado: ${r.status} ${await r.text()}`);
    const items = (await r.json()) as { name: string; id: string | null; created_at?: string; metadata?: { size?: number } | null }[];
    for (const it of items) {
      const ruta = prefijo ? `${prefijo}/${it.name}` : it.name;
      if (it.id === null) salida.push(...(await listar(ruta)));
      else salida.push({ ruta, tam: it.metadata?.size ?? 0, creado: new Date(it.created_at ?? 0) });
    }
    if (items.length < 1000) break;
  }
  return salida;
}

/** Borra un objeto suelto (sin pasar por la validación de rutas de la aplicación) */
async function borrarObjeto(ruta: string) {
  const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${ruta}`, { method: 'DELETE', headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` } });
  if (!r.ok && r.status !== 404) throw new Error(`${r.status} ${await r.text()}`);
}

const base = (ruta: string) => ruta.replace(/\.bin\.\d{1,2}$/, '.bin');

async function principal() {
  const objetos = await listar('');
  const total = objetos.reduce((a, o) => a + o.tam, 0);
  const tamPorBase = new Map<string, number>();
  for (const o of objetos) tamPorBase.set(base(o.ruta), (tamPorBase.get(base(o.ruta)) ?? 0) + o.tam);

  const [docs, gens, plant] = await Promise.all([
    db.documento.findMany({ select: { id: true, rutaCifrada: true, nombreOriginal: true, estadoLectura: true, lectura: true, creadoEn: true, expediente: { select: { numeroInterno: true, generaciones: { select: { estado: true } } } } } }),
    db.generacion.findMany({ select: { rutaDocx: true } }),
    db.plantilla.findMany({ select: { rutaCifrada: true } }),
  ]);
  const usadas = new Set<string>([...docs.map((d) => d.rutaCifrada), ...gens.flatMap((g) => (g.rutaDocx ? [g.rutaDocx] : [])), ...plant.map((p) => p.rutaCifrada)]);

  // 1. Basura segura
  const hace24h = Date.now() - 24 * 3600_000;
  const basura = objetos.filter((o) => o.ruta.startsWith('partes/') ? o.creado.getTime() < hace24h : !usadas.has(base(o.ruta)));
  const tamBasura = basura.reduce((a, o) => a + o.tam, 0);

  // 2. PDF soporte ya usados, de los más antiguos a los más nuevos, hasta la meta
  const candidatos = docs
    .filter((d) => d.rutaCifrada !== ARCHIVO_RETIRADO && d.estadoLectura === 'LEIDO' && d.lectura
      && d.expediente.generaciones.some((g) => g.estado === 'COMPLETADA') && !d.expediente.generaciones.some((g) => g.estado === 'EN_CURSO'))
    .sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime());
  let restante = total - tamBasura;
  const retirar: typeof candidatos = [];
  for (const d of candidatos) {
    if (restante <= META) break;
    retirar.push(d);
    restante -= tamPorBase.get(d.rutaCifrada) ?? 0;
  }

  console.log(`Ocupado ahora: ${(total / MB).toFixed(0)} MB en ${objetos.length} objetos. Meta: ${(META / MB).toFixed(0)} MB.`);
  console.log(`Basura segura: ${basura.length} objetos, ${(tamBasura / MB).toFixed(1)} MB.`);
  const tamRetirar = retirar.reduce((a, d) => a + (tamPorBase.get(d.rutaCifrada) ?? 0), 0);
  const escrituras = new Set(retirar.map((d) => d.expediente.numeroInterno));
  console.log(`PDF soporte por retirar: ${retirar.length} de ${escrituras.size} escrituras, ${(tamRetirar / MB).toFixed(0)} MB.`);
  if (retirar.length) console.log(`  Desde ${retirar[0].creadoEn.toISOString().slice(0, 16)} hasta ${retirar.at(-1)!.creadoEn.toISOString().slice(0, 16)} (UTC).`);
  console.log(`Quedaría: ${(restante / MB).toFixed(0)} MB.`);
  if (!confirmar) return console.log('Nada borrado. Ejecute de nuevo con --confirmar.');

  let fallidos = 0;
  for (const o of basura) await borrarObjeto(o.ruta).catch((e) => { fallidos++; console.error(o.ruta, e.message); });
  for (const [i, d] of retirar.entries()) {
    // Primero la base: si el borrado del archivo falla, queda un huérfano (se limpia en la próxima vuelta), nunca una referencia rota
    await db.documento.update({ where: { id: d.id }, data: { rutaCifrada: ARCHIVO_RETIRADO } });
    await borrarCifrado(d.rutaCifrada).catch((e) => { fallidos++; console.error(d.rutaCifrada, e.message); });
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1} de ${retirar.length}…`);
  }
  console.log(`Listo.${fallidos ? ` Fallaron ${fallidos} borrados (quedan como huérfanos; vuelva a ejecutar).` : ''}`);
}

principal().then(() => db.$disconnect(), async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
