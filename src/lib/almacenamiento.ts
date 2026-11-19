/**
 * Almacenamiento privado de plantillas, documentos y escrituras generadas, cifrados con AES-256-GCM.
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
  // borradores y revisiones: archivos del sistema anterior (scripts/limpiar-sistema-anterior.ts los borra)
  if (!/^(documentos|plantillas|escrituras|borradores|revisiones)\/[0-9a-f]{2}\/[0-9a-f-]{36}\.bin(?:\.\d{1,2})?$/.test(relativa) && !/^partes\/[0-9a-f]{32}\/\d{1,5}\.bin$/.test(relativa)) throw new Error('Ruta de almacenamiento no válida.');
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

/**
 * Supabase rechaza objetos de más de 50 MB (límite global del plan). Un archivo más grande se guarda en
 * piezas de PIEZA bytes, cada una cifrada aparte («<ruta>.1», «<ruta>.2»…), y en la ruta principal va
 * solo un índice cifrado con el número de piezas. Así un PDF escaneado de 60 MB o más se puede cargar.
 */
const PIEZA = 40 * 1024 * 1024;
const MAXIMO_PIEZAS = 64;
const INDICE = Buffer.from('\u0000NOTARIA-PIEZAS\u0000', 'latin1');
const rutaPieza = (relativa: string, i: number) => `${relativa}.${i}`;

async function escribir(relativa: string, cifrado: Buffer, upsert: boolean) {
  if (enSupabase) {
    await supabase(relativa, { method: 'POST', body: new Uint8Array(cifrado), headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': String(upsert) } });
    return;
  }
  const destino = rutaSegura(relativa);
  await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(destino), { recursive: true });
  await fs.writeFile(/*turbopackIgnore: true*/ destino, cifrado, { mode: 0o600 });
}

async function leerUno(relativa: string): Promise<Buffer> {
  if (enSupabase) return descifrar(Buffer.from(await (await supabase(relativa, { method: 'GET' })).arrayBuffer()));
  return descifrar(await fs.readFile(/*turbopackIgnore: true*/ rutaSegura(relativa)));
}

async function borrarUno(relativa: string) {
  if (enSupabase) { await supabase(relativa, { method: 'DELETE' }); return; }
  await fs.rm(/*turbopackIgnore: true*/ rutaSegura(relativa), { force: true });
}

/** Número de piezas si el contenido es un índice de piezas; null si es el archivo mismo */
function piezasDe(contenido: Buffer): number | null {
  if (contenido.length > 200 || !contenido.subarray(0, INDICE.length).equals(INDICE)) return null;
  const n = Number(contenido.subarray(INDICE.length).toString('latin1'));
  return Number.isInteger(n) && n > 0 && n <= MAXIMO_PIEZAS ? n : null;
}

/** Guarda cifrado y devuelve la ruta relativa */
export async function guardarCifrado(datos: Buffer, prefijo: 'documentos' | 'plantillas' | 'escrituras'): Promise<string> {
  const id = crypto.randomUUID();
  const relativa = `${prefijo}/${id.slice(0, 2)}/${id}.bin`;
  if (datos.length <= PIEZA) {
    await escribir(relativa, cifrar(datos), false);
    return relativa;
  }
  const total = Math.ceil(datos.length / PIEZA);
  if (total > MAXIMO_PIEZAS) throw new Error(`Archivo demasiado grande para el almacenamiento (${Math.round(datos.length / 1024 / 1024)} MB).`);
  try {
    for (let i = 0; i < total; i++) await escribir(rutaPieza(relativa, i + 1), cifrar(datos.subarray(i * PIEZA, (i + 1) * PIEZA)), false);
    // El índice va al final: si una pieza falla, no queda un archivo a medias
    await escribir(relativa, cifrar(Buffer.concat([INDICE, Buffer.from(String(total), 'latin1')])), false);
  } catch (e) {
    await Promise.all(Array.from({ length: total }, (_, i) => borrarUno(rutaPieza(relativa, i + 1)).catch(() => undefined)));
    throw e;
  }
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
  const contenido = await leerUno(relativa);
  const total = piezasDe(contenido);
  if (!total) return contenido;
  const piezas: Buffer[] = [];
  for (let i = 1; i <= total; i++) piezas.push(await leerUno(rutaPieza(relativa, i)));
  return Buffer.concat(piezas);
}

export async function borrarCifrado(relativa: string): Promise<void> {
  // Un archivo en piezas: se borran sus piezas (el índice pesa unos bytes; un archivo normal se borra sin leerlo entero)
  let total: number | null = null;
  try {
    if (enSupabase) {
      const r = await supabase(relativa, { method: 'HEAD' });
      if (Number(r.headers.get('content-length') ?? Infinity) <= 200) total = piezasDe(await leerUno(relativa));
    } else if ((await fs.stat(/*turbopackIgnore: true*/ rutaSegura(relativa))).size <= 200) total = piezasDe(await leerUno(relativa));
  } catch { /* no existe o no se pudo leer: se borra lo que haya */ }
  if (total) for (let i = 1; i <= total; i++) await borrarUno(rutaPieza(relativa, i));
  await borrarUno(relativa);
}
