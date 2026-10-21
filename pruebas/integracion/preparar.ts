/**
 * Preparación global de las pruebas de integración: recrea desde cero la base de datos
 * de PRUEBAS (DATABASE_URL_PRUEBA). Se niega a correr contra cualquier otra base.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

export default function preparar() {
  if (!process.env.DATABASE_URL_PRUEBA && fs.existsSync('.env')) process.loadEnvFile('.env');
  const url = process.env.DATABASE_URL_PRUEBA;
  if (!url || !/_prueba(\?|$)/.test(url)) {
    throw new Error('Defina DATABASE_URL_PRUEBA apuntando a una base cuyo nombre termine en "_prueba" (se borra en cada ejecución).');
  }
  execSync('npx prisma migrate reset --force --skip-generate', { env: { ...process.env, DATABASE_URL: url, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'pruebas de integración sobre la base _prueba' }, stdio: 'pipe' });
  fs.rmSync('./almacenamiento_pruebas', { recursive: true, force: true });
}
