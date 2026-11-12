import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Manrope, Outfit } from 'next/font/google';
import { connection } from 'next/server';
import './globals.css';

// Fuentes servidas desde el propio servidor (next/font): ninguna petición sale a Google.
// Outfit (títulos y marca) dialoga con el logotipo; Manrope (texto e interfaz); Plex Mono (radicados y cifras)
const outfit = Outfit({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--fuente-outfit', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--fuente-manrope', display: 'swap' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--fuente-plex-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Escrituración · Notaría 1 Neiva', template: '%s · Notaría 1 Neiva' },
  description: 'Asistente de escrituración con verificación por IA. Uso interno de la Notaría Primera del Círculo de Neiva.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0C172A',
};

export default async function RaizLayout({ children }: { children: React.ReactNode }) {
  // Todas las páginas se generan por petición: la política CSP usa un nonce distinto en cada respuesta
  await connection();
  return (
    <html lang="es-CO" className={`${outfit.variable} ${manrope.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
