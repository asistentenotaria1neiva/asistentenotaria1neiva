'use client';
/**
 * Confirmación propia (dialog nativo) en lugar de window.confirm: mismo efecto (si se cancela, no se hace nada),
 * pero con el estilo de la aplicación, foco atrapado por el navegador, Escape para cancelar y el botón
 * destructivo en rojo. El texto «¿Pregunta? Consecuencia.» se separa en título y explicación.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icono } from './Icono';

interface Pedido { texto: string; boton?: string; peligro?: boolean }

const PALABRAS_PELIGRO = /eliminar|retirar|suspender|borrar|desactivar|restablecer|cerrar sesiones/i;

/** Devuelve [pedir, dialogo]: pedir() muestra la ventana y resuelve true si la persona confirma */
export function useConfirmacion(): [(p: Pedido) => Promise<boolean>, React.ReactNode] {
  const ventana = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);

  const pedir = useCallback((p: Pedido) => new Promise<boolean>((res) => { resolver.current = res; setPedido(p); }), []);
  useEffect(() => { if (pedido && !ventana.current?.open) ventana.current?.showModal(); }, [pedido]);

  const terminar = (ok: boolean) => {
    const r = resolver.current;
    resolver.current = null;
    ventana.current?.close();
    setPedido(null);
    r?.(ok);
  };

  let titulo = pedido?.texto ?? '';
  let detalle = '';
  const corte = titulo.indexOf('?');
  if (corte > 0 && corte < titulo.length - 1) { detalle = titulo.slice(corte + 1).trim(); titulo = titulo.slice(0, corte + 1); }
  const peligro = pedido?.peligro ?? PALABRAS_PELIGRO.test(`${pedido?.boton ?? ''} ${titulo}`);

  const dialogo = (
    <dialog ref={ventana} className={`ventana${peligro ? ' peligro' : ''}`} aria-labelledby="titulo-confirmacion" onClose={() => { if (resolver.current) terminar(false); }}>
      {pedido && (
        <>
          <div className="cabeza">
            <span className="icono-ventana"><Icono nombre={peligro ? 'alerta' : 'info'} tamano={20} /></span>
            <div>
              <h2 id="titulo-confirmacion">{titulo}</h2>
              {detalle && <p>{detalle}</p>}
            </div>
          </div>
          <div className="botones">
            <button type="button" className="secundario" autoFocus onClick={() => terminar(false)}>Cancelar</button>
            <button type="button" className={peligro ? 'peligro' : undefined} onClick={() => terminar(true)}>{pedido.boton ?? 'Confirmar'}</button>
          </div>
        </>
      )}
    </dialog>
  );
  return [pedir, dialogo];
}
