import type { NextConfig } from 'next';

// Cabeceras de seguridad para todas las respuestas (OWASP A05).
// La CSP con nonce se agrega por petición en src/proxy.ts.
const cabecerasSeguridad = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // same-origin: no se envía la URL a otros sitios, y las acciones del propio sitio conservan su cabecera Origin (protección CSRF)
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const config: NextConfig = {
  // Imagen Docker: salida autónoma (BUILD_STANDALONE=1 en el Dockerfile)
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  poweredByHeader: false,
  productionBrowserSourceMaps: false, // el frontend se publica minificado y sin mapas de código
  serverExternalPackages: ['@node-rs/argon2', '@prisma/client'],
  experimental: {
    serverActions: { bodySizeLimit: '30mb' }, // carga de documentos soporte
  },
  async headers() {
    return [{ source: '/:path*', headers: cabecerasSeguridad }];
  },
};

export default config;
