/**
 * Mantiene caliente la caché de las instrucciones de redacción en horario de oficina.
 *
 * Las instrucciones (SISTEMA_REDACCION, ~17.000 tokens con el esquema) quedan en caché una hora. Si pasa
 * más de una hora entre dos escrituras, la siguiente vuelve a escribirlas en caché (2 × el precio de
 * entrada: ~US$0,07 con Sonnet). Una llamada mínima antes de que venza la renueva otra hora por ~US$0,003
 * (lectura de caché al 10 % y una respuesta vacía).
 *
 * Solo se renueva una caché que ya está caliente (hubo una redacción hace 45-57 minutos): calentarla en
 * frío costaría lo mismo que la primera escritura, sin ahorro. El disparador es el aviso de actividad de
 * las páginas (src/app/api/sesion/actividad), que llega cada 3 minutos mientras alguien trabaja, así que
 * no hace falta un cron. Cada renovación queda en consumo_ia (REDACCION, sin escritura).
 */
import 'server-only';
import { db } from '../db';
import { obtenerConfig } from '../configuracion';
import { llamarEstructurado, configuracionModelo } from '../ia/cliente';
import { SISTEMA_REDACCION, ESQUEMA_REDACCION } from '../ia/instrucciones';

const DESDE_MIN = 45;
const HASTA_MIN = 57;

let enCurso = false;

/** Día (0 = domingo) y hora «HH:MM» en Neiva */
function ahoraEnNeiva(): { dia: number; hora: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  const dias = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { dia: dias.indexOf(p.weekday), hora: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

export async function mantenerCacheRedaccion(): Promise<void> {
  if (enCurso) return;
  enCurso = true;
  try {
    // Horario de la notaría (el de acceso del personal), aunque la restricción de acceso esté apagada
    const horario = await obtenerConfig('acceso.horario');
    const { dia, hora } = ahoraEnNeiva();
    if (!horario.dias.includes(dia) || hora < horario.desde || hora >= horario.hasta) return;

    // La caché es de cada modelo: cuenta la última llamada de redacción con el modelo actual
    const { modelo } = configuracionModelo('REDACCION');
    const ultima = await db.consumoIA.findFirst({
      where: { proposito: 'REDACCION', modelo: { startsWith: modelo } },
      orderBy: { creadoEn: 'desc' },
      select: { creadoEn: true },
    });
    if (!ultima) return;
    const minutos = (Date.now() - ultima.creadoEn.getTime()) / 60_000;
    if (minutos < DESDE_MIN || minutos >= HASTA_MIN) return;

    await llamarEstructurado({
      proposito: 'REDACCION',
      registro: {},
      sistema: SISTEMA_REDACCION,
      contenido: [{ type: 'text', text: 'MANTENIMIENTO DE CACHÉ: no hay escritura que adaptar. Responde de inmediato, sin razonar: "resumen" vacío y "otorgantes", "cambios" y "advertencias" como listas vacías.' }],
      sistemaUnaHora: true,
      esquema: ESQUEMA_REDACCION as unknown as Record<string, unknown>,
      maxTokens: 2000,
    });
  } catch (e) {
    console.warn('[ia] no se pudo renovar la caché de la redacción', e);
  } finally {
    enCurso = false;
  }
}
