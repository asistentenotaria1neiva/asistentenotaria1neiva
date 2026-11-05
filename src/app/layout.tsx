import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { connection } from 'next/server';
import './globals.css';

// Fuentes servidas desde el propio servidor (next/font): ninguna petición sale a Google
const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--fuente-plex', display: 'swap' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--fuente-plex-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Escrituración – Notaría Primera de Neiva',
  description: 'Asistente de escrituración con verificación por IA. Uso interno de la Notaría Primera del Círculo de Neiva.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1f3864',
};

export default async function RaizLayout({ children }: { children: React.ReactNode }) {
  // Todas las páginas se generan por petición: la política CSP usa un nonce distinto en cada respuesta
  await connection();
  return (
    <html lang="es-CO" className={`${plex.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
