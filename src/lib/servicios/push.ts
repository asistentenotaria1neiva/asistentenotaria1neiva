/**
 * Avisos push (Web Push): el servidor envía cada notificación a los navegadores donde la persona
 * activó los avisos. Llegan como aviso de Windows aunque la pestaña esté dormida o cerrada, mientras
 * el navegador esté abierto. Los muestra el service worker (public/sw.js).
 * Requiere VAPID_PUBLICA y VAPID_PRIVADA (genere el par con: npx web-push generate-vapid-keys).
 * Sin ellas, los avisos siguen funcionando solo con la página abierta.
 */
import 'server-only';
import { sendNotification, setVapidDetails } from 'web-push';
import { db } from '../db';

const PUBLICA = process.env.VAPID_PUBLICA?.trim() || null;
const PRIVADA = process.env.VAPID_PRIVADA?.trim() || null;
const CONTACTO = process.env.VAPID_CONTACTO?.trim() || process.env.URL_APLICACION?.trim() || 'mailto:soporte@localhost';

let configurado = false;
function configurar(): boolean {
  if (!PUBLICA || !PRIVADA) return false;
  if (!configurado) { setVapidDetails(CONTACTO, PUBLICA, PRIVADA); configurado = true; }
  return true;
}

/** Clave pública que el navegador usa para suscribirse (null = push no configurado) */
export const clavePublicaPush = () => PUBLICA;

export interface SuscripcionNavegador { endpoint: string; keys: { p256dh: string; auth: string } }

export function esSuscripcionValida(x: unknown): x is SuscripcionNavegador {
  const s = x as SuscripcionNavegador | null;
  return !!s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length <= 2000
    && typeof s.keys?.p256dh === 'string' && s.keys.p256dh.length <= 200
    && typeof s.keys?.auth === 'string' && s.keys.auth.length <= 100;
}

export async function guardarSuscripcion(usuarioId: string, s: SuscripcionNavegador) {
  // Si el mismo navegador pasa a otra persona (otra sesión en el equipo), queda a nombre de la última
  await db.suscripcionPush.upsert({
    where: { endpoint: s.endpoint },
    create: { usuarioId, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth },
    update: { usuarioId, p256dh: s.keys.p256dh, auth: s.keys.auth },
  });
}

export async function quitarSuscripcion(usuarioId: string, endpoint: string) {
  await db.suscripcionPush.deleteMany({ where: { usuarioId, endpoint } });
}

export interface AvisoPush { id: string; titulo: string; mensaje: string; enlace: string | null }

/** Envía el aviso a todos los navegadores de la persona. Nunca lanza error. */
export async function enviarPush(usuarioId: string, aviso: AvisoPush): Promise<void> {
  try {
    if (!configurar()) return;
    const suscripciones = await db.suscripcionPush.findMany({ where: { usuarioId } });
    const carga = JSON.stringify(aviso);
    await Promise.all(suscripciones.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 60 * 60 * 24, urgency: 'high' });
      } catch (e) {
        const estado = (e as { statusCode?: number }).statusCode;
        // 404/410: el navegador anuló la suscripción (permiso retirado, datos borrados…)
        if (estado === 404 || estado === 410) await db.suscripcionPush.delete({ where: { id: s.id } }).catch(() => {});
        else console.error('[push]', estado ?? e);
      }
    }));
  } catch (e) {
    console.error('[push]', e);
  }
}
