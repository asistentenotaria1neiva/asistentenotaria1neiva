'use client';
/** Error inesperado dentro de la aplicación: el menú sigue disponible y se puede reintentar */
import Link from 'next/link';
import { Icono } from '../Icono';

export default function ErrorApp({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && 'digest' in error ? String((error as Error & { digest?: string }).digest ?? '') : '';
  return (
    <section className="tarjeta pagina-estado" role="alert">
      <span className="icono-vacio"><Icono nombre="alerta" tamano={26} /></span>
      <h1>No se pudo cargar esta página</h1>
      <p className="suave">Ocurrió un error inesperado; su trabajo guardado no se perdió. Intente de nuevo y, si persiste, informe al administrador{digest ? <> con el código <code>{digest}</code></> : ''}.</p>
      <div className="fila">
        <button type="button" onClick={() => retry()}><Icono nombre="refrescar" tamano={18} />Reintentar</button>
        <Link className="boton secundario" href="/"><Icono nombre="inicio" tamano={18} />Ir al inicio</Link>
      </div>
    </section>
  );
}
