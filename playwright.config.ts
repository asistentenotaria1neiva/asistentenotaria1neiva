/**
 * Pruebas de punta a punta en navegador real.
 * Levantan la aplicación COMPILADA contra la base de datos de PRUEBAS (DATABASE_URL_PRUEBA),
 * que se recrea vacía en cada ejecución. Uso: npm run prueba:e2e
 */
import { defineConfig } from '@playwright/test';
import fs from 'node:fs';

if (!process.env.DATABASE_URL_PRUEBA && fs.existsSync('.env')) process.loadEnvFile('.env');
const PUERTO = 3100;

export default defineConfig({
  testDir: './pruebas/e2e',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PUERTO}`, locale: 'es-CO', timezoneId: 'America/Bogota', trace: 'retain-on-failure' },
  outputDir: './pruebas/salida/e2e',
  webServer: {
    // Primero se recrea vacía la base de pruebas y después arranca el servidor (que carga el catálogo al iniciar)
    command: `npx tsx pruebas/e2e/preparar.ts && npx next start -p ${PUERTO}`,
    url: `http://localhost:${PUERTO}/ingreso`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...(process.env as Record<string, string>),
      DATABASE_URL: process.env.DATABASE_URL_PRUEBA ?? '',
      RUTA_ALMACENAMIENTO: './almacenamiento_pruebas',
      IPS_OFICINA: '127.0.0.1,::1',
      CONFIAR_EN_PROXY: 'false',
      PERMITIR_HTTP_LOCAL: 'true',
      ANTHROPIC_API_KEY: '', // las pruebas no consumen la API de Claude
    },
  },
});
