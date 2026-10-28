'use client';

import { useEffect } from 'react';

/** Cada cuánto se avisa al servidor que hay actividad (la sesión se cierra a los 20 minutos sin ella) */
const INTERVALO_MS = 3 * 60_000;
const EVENTOS = ['keydown', 'input', 'pointerdown', 'wheel', 'touchstart'] as const;

/**
 * Mantiene viva la sesión mientras el usuario trabaja en la página (digita, hace clic o se desplaza),
 * aunque no guarde nada. Sin actividad no avisa, y la sesión se cierra por inactividad como siempre.
 */
export function Actividad() {
  useEffect(() => {
    let hubo = false;
    const marcar = () => { hubo = true; };
    for (const e of EVENTOS) window.addEventListener(e, marcar, { passive: true, capture: true });
    const t = window.setInterval(() => {
      if (!hubo) return;
      hubo = false;
      fetch('/api/sesion/actividad', { method: 'POST', cache: 'no-store' }).catch(() => undefined);
    }, INTERVALO_MS);
    return () => {
      window.clearInterval(t);
      for (const e of EVENTOS) window.removeEventListener(e, marcar, { capture: true });
    };
  }, []);
  return null;
}
