// Pruebas de integración contra PostgreSQL. Usan una base de datos EXCLUSIVA de pruebas
// (DATABASE_URL_PRUEBA) que se borra y recrea en cada ejecución; nunca la base de trabajo.
// Requisito: docker compose -f docker-compose.dev.yml up -d
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

const env = loadEnv('', process.cwd(), '');

export default defineConfig({
  test: {
    include: ['pruebas/integracion/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./pruebas/integracion/preparar.ts'],
    env: { ...env, DATABASE_URL: env.DATABASE_URL_PRUEBA ?? '', RUTA_ALMACENAMIENTO: './almacenamiento_pruebas' },
    testTimeout: 120_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // "server-only" solo protege contra importaciones desde el navegador; en las pruebas se reemplaza por un módulo vacío
      'server-only': fileURLToPath(new URL('./pruebas/integracion/vacio.ts', import.meta.url)),
    },
  },
});
