import type { Metadata } from 'next';
import { connection } from 'next/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'Escrituración – Notaría Primera de Neiva',
  description: 'Asistente de escrituración con verificación por IA. Uso interno de la Notaría Primera del Círculo de Neiva.',
  robots: { index: false, follow: false },
};

export default async function RaizLayout({ children }: { children: React.ReactNode }) {
  // Todas las páginas se generan por petición: la política CSP usa un nonce distinto en cada respuesta
  await connection();
  return (
    <html lang="es-CO">
      <body>{children}</body>
    </html>
  );
}
