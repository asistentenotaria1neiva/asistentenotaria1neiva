'use client';
/**
 * Enlace a «Notificaciones» con el número de no leídas. Consulta cada 30 segundos y, si la persona
 * lo activó en este equipo, muestra cada notificación nueva como aviso del navegador (aunque esté en
 * otra pestaña o ventana).
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const CADA_MS = 30_000;

interface Respuesta { ahora: string; noLeidas: number; nuevas: { id: string; titulo: string; mensaje: string; enlace: string | null }[] }

export function Avisos({ inicial }: { inicial: number }) {
  const router = useRouter();
  const ruta = usePathname();
  const [cuenta, setCuenta] = useState(inicial);
  const [permiso, setPermiso] = useState<NotificationPermission | 'no-disponible'>('no-disponible');
  const desde = useRef(new Date().toISOString());

  // Al cambiar de página (p. ej. al abrir «Notificaciones», que las marca leídas) llega la cuenta nueva del servidor
  const [inicialPrevio, setInicialPrevio] = useState(inicial);
  if (inicial !== inicialPrevio) { setInicialPrevio(inicial); setCuenta(inicial); }

  useEffect(() => {
    if ('Notification' in window) setPermiso(Notification.permission);
    let activo = true;
    const consultar = async () => {
      try {
        const r = await fetch(`/api/notificaciones?desde=${encodeURIComponent(desde.current)}`, { cache: 'no-store' });
        if (!r.ok || !activo) return;
        const datos = (await r.json()) as Respuesta;
        desde.current = datos.ahora;
        setCuenta(datos.noLeidas);
        if (!datos.nuevas.length) return;
        router.refresh(); // la página abierta puede mostrar el resultado (p. ej. las preguntas del asistente)
        if ('Notification' in window && Notification.permission === 'granted') {
          for (const n of datos.nuevas) {
            const aviso = new Notification(n.titulo, { body: n.mensaje, tag: n.id, lang: 'es' });
            aviso.onclick = () => { window.focus(); router.push(n.enlace ?? '/notificaciones'); aviso.close(); };
          }
        }
      } catch {
        // Sin conexión: se intenta en la próxima consulta
      }
    };
    const t = setInterval(consultar, CADA_MS);
    return () => { activo = false; clearInterval(t); };
  }, [router]);

  return (
    <div className="avisos">
      <Link href="/notificaciones" aria-current={ruta === '/notificaciones' ? 'page' : undefined}>
        Notificaciones {cuenta > 0 && <span className="conteo-avisos" aria-label={`${cuenta} sin leer`}>{cuenta}</span>}
      </Link>
      {permiso === 'default' && (
        <button type="button" className="secundario pequeno" onClick={async () => setPermiso(await Notification.requestPermission())}>
          Avisarme en este equipo
        </button>
      )}
    </div>
  );
}
