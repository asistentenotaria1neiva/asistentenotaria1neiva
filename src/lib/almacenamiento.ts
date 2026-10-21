/**
 * Almacenamiento privado de documentos y borradores, cifrados con AES-256-GCM.
 * Solo el servidor accede a esta carpeta (fuera de /public, sin URL directa).
 */
import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { cifrar, descifrar } from './seguridad/cifrado';

const RAIZ = path.resolve(/*turbopackIgnore: true*/ process.env.RUTA_ALMACENAMIENTO ?? './almacenamiento');

function rutaSegura(relativa: string): string {
  const absoluta = path.resolve(RAIZ, relativa);
  if (!absoluta.startsWith(RAIZ + path.sep)) throw new Error('Ruta de almacenamiento no válida.');
  return absoluta;
}

/** Guarda cifrado y devuelve la ruta relativa */
export async function guardarCifrado(datos: Buffer, prefijo: 'documentos' | 'borradores'): Promise<string> {
  const id = crypto.randomUUID();
  const relativa = path.join(prefijo, id.slice(0, 2), `${id}.bin`);
  const destino = rutaSegura(relativa);
  await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(destino), { recursive: true });
  await fs.writeFile(/*turbopackIgnore: true*/ destino, cifrar(datos), { mode: 0o600 });
  return relativa.split(path.sep).join('/');
}

export async function leerCifrado(relativa: string): Promise<Buffer> {
  return descifrar(await fs.readFile(/*turbopackIgnore: true*/ rutaSegura(relativa)));
}

export async function borrarCifrado(relativa: string): Promise<void> {
  await fs.rm(/*turbopackIgnore: true*/ rutaSegura(relativa), { force: true });
}
