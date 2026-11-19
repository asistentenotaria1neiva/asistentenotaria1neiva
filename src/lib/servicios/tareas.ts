/**
 * Etapas en segundo plano. En Vercel cada invocación se corta a los 5 minutos: la generación de una
 * escritura avanza por etapas (leer documentos, redactar, buscar faltantes, armar el Word), cada una en
 * su propia invocación. Al terminar una, la aplicación pide la siguiente a /api/tareas con una petición
 * firmada (CLAVE_FIRMA). Si el encadenamiento falla o una etapa se corta, la página la reanuda.
 */
import 'server-only';
import crypto from 'node:crypto';
import { huellaToken } from '../seguridad/cifrado';

/** Sin cambios en este tiempo, la etapa se cortó (ninguna invocación dura más de 5 minutos) */
export const LIMITE_SIN_LATIDO_MS = 6 * 60_000;

const firma = (id: string, turno: number) => huellaToken(`tarea:${id}:${turno}`);

export function firmaValida(id: string, turno: number, recibida: string): boolean {
  const a = Buffer.from(firma(id, turno));
  const b = Buffer.from(String(recibida));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Esperas antes de cada intento de pedir la siguiente etapa. La última cubre los momentos en que se
 * publica una versión nueva de la aplicación y por unos segundos no responde.
 */
const ESPERAS = [0, 2_000, 8_000, 30_000];

/**
 * Pide a la aplicación (`base`/api/tareas) que ejecute la etapa `turno` de la tarea `id` en una
 * invocación nueva. Repetir la petición no duplica el trabajo: cada etapa toma su turno una sola vez.
 * Devuelve false si no se pudo (la página la reanudará).
 */
export async function pedirEtapa(base: string, id: string, turno: number): Promise<boolean> {
  return pedir(`${base}/api/tareas`, { id, turno, firma: firma(id, turno) });
}

/**
 * Continuación de la lectura de un documento largo (src/lib/servicios/documentos.ts) en una invocación
 * nueva (`base`/api/lecturas). Repetirla no duplica nada: la lectura solo se toma si nadie la tiene.
 */
const firmaLectura = (documentoId: string, usuarioId: string) => huellaToken(`lectura:${documentoId}:${usuarioId}`);

export function firmaLecturaValida(documentoId: string, usuarioId: string, recibida: string): boolean {
  const a = Buffer.from(firmaLectura(documentoId, usuarioId));
  const b = Buffer.from(String(recibida));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function pedirLectura(base: string, documentoId: string, usuarioId: string): Promise<boolean> {
  return pedir(`${base}/api/lecturas`, { id: documentoId, usuario: usuarioId, firma: firmaLectura(documentoId, usuarioId) });
}

async function pedir(url: string, cuerpo: Record<string, unknown>): Promise<boolean> {
  for (const [i, espera] of ESPERAS.entries()) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    try {
      const r = await fetch(url, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(20_000),
      });
      if (r.ok) return true;
      console.error(`[tareas] encadenar: el intento ${i + 1} respondió ${r.status}`);
      if (r.status === 401) break;
    } catch (e) {
      console.error(`[tareas] encadenar: el intento ${i + 1} falló`, e);
    }
  }
  return false;
}
