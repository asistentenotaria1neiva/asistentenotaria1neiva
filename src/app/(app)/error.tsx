'use client';
/** Error inesperado dentro de la aplicación: el menú sigue disponible y se puede reintentar */
import Link from 'next/link';

export default function ErrorApp({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && 'digest' in error ? String((error as Error & { digest?: string }).digest ?? '') : '';
  return (
    <section className="tarjeta pagina-estado" role="alert">
      <h1>No se pudo cargar esta página</h1>
      <p className="suave">Ocurrió un error inesperado. Intente de nuevo; si persiste, informe al administrador{digest ? <> con el código <code>{digest}</code></> : ''}.</p>
      <div className="fila">
        <button type="button" onClick={() => retry()}>Reintentar</button>
        <Link className="boton secundario" href="/">Ir al inicio</Link>
      </div>
    </section>
  );
}
