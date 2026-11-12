'use client';
/**
 * Enlace a «Notificaciones» con el número de no leídas. Consulta cada 30 segundos y, si la persona
 * lo activó en este equipo, muestra cada notificación nueva como aviso del navegador (aunque esté en
 * otra pestaña o ventana). Además, cada notificación nueva aparece como un aviso emergente en la
 * esquina inferior derecha de la aplicación, que se cierra solo a los pocos segundos.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icono } from '../../Icono';
import { Pendiente } from '../navegacion';

const CADA_MS = 30_000;
const DURACION_EMERGENTE_MS = 10_000;
const MAX_EMERGENTES = 3;
const CLAVE_INVITACION = 'avisos-invitacion-descartada';

interface Nueva { id: string; titulo: string; mensaje: string; enlace: string | null }
interface Respuesta { ahora: string; noLeidas: number; nuevas: Nueva[] }

export function Avisos({ inicial }: { inicial: number }) {
  const router = useRouter();
  const ruta = usePathname();
  const [cuenta, setCuenta] = useState(inicial);
  const [permiso, setPermiso] = useState<NotificationPermission | 'no-disponible'>('no-disponible');
  const desde = useRef(new Date().toISOString());
  const [emergentes, setEmergentes] = useState<Nueva[]>([]);
  const [montado, setMontado] = useState(false);
  const quitar = useCallback((id: string) => setEmergentes((l) => l.filter((n) => n.id !== id)), []);

  // Al cambiar de página (p. ej. al abrir «Notificaciones», que las marca leídas) llega la cuenta nueva del servidor
  const [inicialPrevio, setInicialPrevio] = useState(inicial);
  if (inicial !== inicialPrevio) { setInicialPrevio(inicial); setCuenta(inicial); }

  // ¿La persona está mirando la aplicación? (pestaña visible y ventana con el foco)
  const [atenta, setAtenta] = useState(true);
  const [invitacionDescartada, setInvitacionDescartada] = useState(true);

  useEffect(() => {
    setMontado(true);
    if ('Notification' in window) setPermiso(Notification.permission);
    try { setInvitacionDescartada(localStorage.getItem(CLAVE_INVITACION) === '1'); } catch { setInvitacionDescartada(false); }
    const mirar = () => setAtenta(document.visibilityState === 'visible' && document.hasFocus());
    mirar();
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
        setEmergentes((l) => [...l.filter((v) => !datos.nuevas.some((n) => n.id === v.id)), ...datos.nuevas].slice(-MAX_EMERGENTES));
        // Aviso del sistema solo si la persona está en otra pestaña o en otro programa (si no, basta el emergente)
        const fuera = document.visibilityState !== 'visible' || !document.hasFocus();
        if (fuera && 'Notification' in window && Notification.permission === 'granted') {
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
    // Al volver a la pestaña se consulta de inmediato, sin esperar la próxima vuelta
    const alVolver = () => { mirar(); if (document.visibilityState === 'visible') void consultar(); };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);
    window.addEventListener('blur', mirar);
    return () => {
      activo = false; clearInterval(t);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
      window.removeEventListener('blur', mirar);
    };
  }, [router]);

  // El número de no leídas también en el título de la pestaña, para verlo desde otras pestañas
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = cuenta > 0 ? `(${cuenta}) ${base}` : base;
  }, [cuenta, ruta]);

  const activar = async () => setPermiso(await Notification.requestPermission());
  const descartarInvitacion = () => {
    setInvitacionDescartada(true);
    try { localStorage.setItem(CLAVE_INVITACION, '1'); } catch { /* sin almacenamiento: solo por esta visita */ }
  };

  return (
    <>
      <Link href="/notificaciones" aria-current={ruta === '/notificaciones' ? 'page' : undefined}>
        <Icono nombre="campana" tamano={18} /><span>Notificaciones</span>
        {cuenta > 0 && <span className="conteo-avisos" aria-label={`${cuenta} sin leer`}>{cuenta}</span>}
        <Pendiente />
      </Link>
      {permiso === 'default' && (
        <button type="button" className="activar-avisos" onClick={activar}>
          Avisarme en este equipo
        </button>
      )}
      {permiso === 'denied' && (
        <span className="activar-avisos bloqueados" title="Para recibirlos: pulse el candado junto a la dirección del navegador, permita «Notificaciones» y recargue la página.">
          Avisos bloqueados en este navegador
        </span>
      )}
      {montado && createPortal(
        <div className="emergentes" role="status" aria-live="polite">
          {permiso === 'default' && !invitacionDescartada && (
            <div className="emergente invitacion">
              <span className="icono-aviso" aria-hidden="true"><Icono nombre="campana" tamano={18} /></span>
              <div className="contenido">
                <strong>¿Le avisamos aunque esté en otra pestaña?</strong>
                <span>Cuando una escritura esté lista le llegará un aviso de Windows, aunque esté trabajando en otra página o programa.</span>
                <div className="fila acciones-invitacion">
                  <button type="button" className="pequeno" onClick={activar}>Activar avisos</button>
                  <button type="button" className="pequeno secundario" onClick={descartarInvitacion}>Ahora no</button>
                </div>
              </div>
            </div>
          )}
          {emergentes.map((n) => (
            <Emergente key={n.id} aviso={n} enEspera={!atenta} alCerrar={quitar} alAbrir={(a) => { quitar(a.id); router.push(a.enlace ?? '/notificaciones'); }} />
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Aviso emergente: se cierra solo, salvo mientras el puntero o el foco están encima o la persona está
 * en otra pestaña o programa (así lo encuentra al volver).
 */
function Emergente({ aviso, enEspera, alCerrar, alAbrir }: { aviso: Nueva; enEspera: boolean; alCerrar: (id: string) => void; alAbrir: (a: Nueva) => void }) {
  const [pausado, setPausado] = useState(false);
  useEffect(() => {
    if (pausado || enEspera) return;
    const t = setTimeout(() => alCerrar(aviso.id), DURACION_EMERGENTE_MS);
    return () => clearTimeout(t);
  }, [pausado, enEspera, aviso.id, alCerrar]);
  return (
    <div
      className="emergente"
      onMouseEnter={() => setPausado(true)} onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)} onBlur={() => setPausado(false)}
    >
      <span className="icono-aviso" aria-hidden="true"><Icono nombre="campana" tamano={18} /></span>
      <button type="button" className="contenido" onClick={() => alAbrir(aviso)}>
        <strong>{aviso.titulo}</strong>
        <span>{aviso.mensaje}</span>
      </button>
      <button type="button" className="cerrar" aria-label="Cerrar aviso" onClick={() => alCerrar(aviso.id)}>
        <Icono nombre="cerrar" tamano={16} />
      </button>
    </div>
  );
}
