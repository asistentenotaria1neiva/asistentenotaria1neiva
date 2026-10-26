/**
 * Almacenamiento privado de documentos y borradores, cifrados con AES-256-GCM.
 * Solo el servidor accede (sin URL directa). Dos destinos, con la misma ruta relativa:
 *   - Supabase Storage (bucket privado), si SUPABASE_URL y SUPABASE_CLAVE_SERVICIO están definidas
 *     (despliegue en Vercel, que no conserva archivos en disco);
 *   - carpeta local RUTA_ALMACENAMIENTO en otro caso (desarrollo sin conexión).
 * El cifrado lo hace siempre la aplicación: el proveedor solo recibe bytes cifrados.
 */
import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { cifrar, descifrar } from './seguridad/cifrado';

const RAIZ = path.resolve(/*turbopackIgnore: true*/ process.env.RUTA_ALMACENAMIENTO ?? './almacenamiento');

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const SUPABASE_CLAVE = process.env.SUPABASE_CLAVE_SERVICIO;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET ?? 'documentos';
const enSupabase = Boolean(SUPABASE_URL && SUPABASE_CLAVE);

function rutaSegura(relativa: string): string {
  const absoluta = path.resolve(RAIZ, relativa);
  if (!absoluta.startsWith(RAIZ + path.sep)) throw new Error('Ruta de almacenamiento no válida.');
  return absoluta;
}

function urlObjeto(relativa: string): string {
  if (!/^(documentos|borradores)\/[0-9a-f]{2}\/[0-9a-f-]{36}\.bin$/.test(relativa) && !/^partes\/[0-9a-f]{32}\/\d{1,5}\.bin$/.test(relativa)) throw new Error('Ruta de almacenamiento no válida.');
  return `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${relativa}`;
}

async function supabase(relativa: string, init: RequestInit): Promise<Response> {
  const r = await fetch(urlObjeto(relativa), {
    ...init,
    cache: 'no-store',
    headers: { apikey: SUPABASE_CLAVE!, Authorization: `Bearer ${SUPABASE_CLAVE}`, ...init.headers },
  });
  if (!r.ok && !(init.method === 'DELETE' && r.status === 404)) {
    throw new Error(`Almacenamiento: ${init.method ?? 'GET'} respondió ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  return r;
}

/** Guarda cifrado y devuelve la ruta relativa */
export async function guardarCifrado(datos: Buffer, prefijo: 'documentos' | 'borradores'): Promise<string> {
  const id = crypto.randomUUID();
  const relativa = `${prefijo}/${id.slice(0, 2)}/${id}.bin`;
  if (enSupabase) {
    await supabase(relativa, { method: 'POST', body: new Uint8Array(cifrar(datos)), headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' } });
    return relativa;
  }
  const destino = rutaSegura(relativa);
  await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(destino), { recursive: true });
  await fs.writeFile(/*turbopackIgnore: true*/ destino, cifrar(datos), { mode: 0o600 });
  return relativa;
}

/**
 * Partes de un archivo que llega en varias peticiones (Vercel limita cada una a 4,5 MB).
 * Se guardan cifradas hasta que llega la última; luego se unen y se borran. `carga` son 32 hex.
 */
const rutaParte = (carga: string, indice: number) => {
  if (!/^[0-9a-f]{32}$/.test(carga) || !Number.isInteger(indice) || indice < 0 || indice > 99_999) throw new Error('Parte de carga no válida.');
  return `partes/${carga}/${indice}.bin`;
};

export async function guardarParte(carga: string, indice: number, datos: Buffer): Promise<void> {
  const relativa = rutaParte(carga, indice);
  if (enSupabase) {
    await supabase(relativa, { method: 'POST', body: new Uint8Array(cifrar(datos)), headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' } });
    return;
  }
  const destino = rutaSegura(relativa);
  await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(destino), { recursive: true });
  await fs.writeFile(/*turbopackIgnore: true*/ destino, cifrar(datos), { mode: 0o600 });
}

/** Une las partes 0…total-1 en un solo archivo y las borra (también si falta alguna) */
export async function unirPartes(carga: string, total: number): Promise<Buffer> {
  const rutas = Array.from({ length: total }, (_, i) => rutaParte(carga, i));
  try {
    const partes: Buffer[] = [];
    for (const r of rutas) partes.push(await leerCifrado(r));
    return Buffer.concat(partes);
  } finally {
    await Promise.all(rutas.map((r) => borrarCifrado(r).catch(() => undefined)));
  }
}

export async function leerCifrado(relativa: string): Promise<Buffer> {
  if (enSupabase) return descifrar(Buffer.from(await (await supabase(relativa, { method: 'GET' })).arrayBuffer()));
  return descifrar(await fs.readFile(/*turbopackIgnore: true*/ rutaSegura(relativa)));
}

export async function borrarCifrado(relativa: string): Promise<void> {
  if (enSupabase) { await supabase(relativa, { method: 'DELETE' }); return; }
  await fs.rm(/*turbopackIgnore: true*/ rutaSegura(relativa), { force: true });
}
