/**
 * Contraseñas con Argon2id (parámetros recomendados por OWASP: 19 MiB, t=2, p=1)
 * y política mínima de complejidad.
 */
import { hash, verify } from '@node-rs/argon2';

const PARAMETROS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const hashContrasena = (contrasena: string) => hash(contrasena, PARAMETROS);

export async function verificarContrasena(hashGuardado: string, contrasena: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, contrasena);
  } catch {
    return false;
  }
}

const COMUNES = ['123456789012', 'contraseña123', 'notaria12345', 'neiva1234567', 'password1234', 'qwertyuiop12'];

/** Devuelve la lista de incumplimientos de la política (vacía si es válida) */
export function politicaContrasena(contrasena: string, usuario?: string): string[] {
  const errores: string[] = [];
  if (contrasena.length < 12) errores.push('Debe tener al menos 12 caracteres.');
  if (contrasena.length > 128) errores.push('No puede tener más de 128 caracteres.');
  if (!/[a-zñ]/.test(contrasena) || !/[A-ZÑ]/.test(contrasena)) errores.push('Debe combinar mayúsculas y minúsculas.');
  if (!/\d/.test(contrasena)) errores.push('Debe incluir al menos un número.');
  if (usuario && contrasena.toLowerCase().includes(usuario.toLowerCase())) errores.push('No puede contener el nombre de usuario.');
  if (COMUNES.some((c) => contrasena.toLowerCase().includes(c))) errores.push('Es demasiado común.');
  return errores;
}
