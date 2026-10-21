import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['pruebas/**/*.test.ts'],
    exclude: ['pruebas/integracion/**', 'pruebas/e2e/**', 'node_modules/**'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
