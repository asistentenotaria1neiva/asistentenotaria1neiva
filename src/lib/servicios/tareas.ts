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

/** Esperas antes de cada intento de pedir la siguiente etapa */
const ESPERAS = [0, 2_000, 8_000];

/**
 * Pide a la aplicación (`base`/api/tareas) que ejecute la etapa `turno` de la tarea `id` en una
 * invocación nueva. Repetir la petición no duplica el trabajo: cada etapa toma su turno una sola vez.
 * Devuelve false si no se pudo (la página la reanudará).
 */
export async function pedirEtapa(base: string, id: string, turno: number): Promise<boolean> {
  for (const [i, espera] of ESPERAS.entries()) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    try {
      const r = await fetch(`${base}/api/tareas`, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, turno, firma: firma(id, turno) }),
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
