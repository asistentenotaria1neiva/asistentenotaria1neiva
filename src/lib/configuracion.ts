/**
 * Parámetros generales administrables desde el panel (tabla "configuracion").
 * Cada clave tiene un valor por defecto; el administrador lo cambia y el cambio se audita.
 */
import 'server-only';
import { db } from './db';
import { NOTARIA_POR_DEFECTO, type ConfigNotaria } from './escritura/contexto';

export interface Configuraciones {
  'red.ips_oficina': string[];
  'sesion.inactividad_minutos': number;
  'sesion.duracion_maxima_horas': number;
  'acceso.intentos_maximos': number;
  'acceso.bloqueo_minutos': number;
  'acceso.horario': { activo: boolean; dias: number[]; desde: string; hasta: string };
  'reglas.dias_vigencia_certificado': number;
  'reglas.dias_aviso_paz_salvo': number;
  'reglas.dias_vigencia_cert_existencia': number;
  notaria: ConfigNotaria;
  'ia.creditos': { saldoUSD: number; fecha: string };
}

export const POR_DEFECTO: Configuraciones = {
  'red.ips_oficina': (process.env.IPS_OFICINA ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  'sesion.inactividad_minutos': 20,
  'sesion.duracion_maxima_horas': 10,
  'acceso.intentos_maximos': 5,
  'acceso.bloqueo_minutos': 30,
  'acceso.horario': { activo: false, dias: [1, 2, 3, 4, 5, 6], desde: '07:00', hasta: '19:00' },
  'reglas.dias_vigencia_certificado': 30,
  'reglas.dias_aviso_paz_salvo': 5,
  'reglas.dias_vigencia_cert_existencia': 30,
  notaria: NOTARIA_POR_DEFECTO,
  'ia.creditos': { saldoUSD: 0, fecha: '' },
};

export const DESCRIPCIONES: Record<keyof Configuraciones, string> = {
  'red.ips_oficina': 'IP públicas de la oficina (lista blanca). El personal solo entra desde estas IP; el administrador puede entrar desde fuera con doble factor.',
  'sesion.inactividad_minutos': 'Minutos sin actividad antes de cerrar la sesión.',
  'sesion.duracion_maxima_horas': 'Duración máxima de una sesión, aunque haya actividad.',
  'acceso.intentos_maximos': 'Intentos fallidos de contraseña antes de bloquear la cuenta.',
  'acceso.bloqueo_minutos': 'Minutos de bloqueo tras superar los intentos.',
  'acceso.horario': 'Horario permitido de acceso para el personal (el administrador no tiene restricción de horario).',
  'reglas.dias_vigencia_certificado': 'Antigüedad máxima del certificado de tradición antes de advertir (umbral a definir por el notario).',
  'reglas.dias_aviso_paz_salvo': 'Días antes del vencimiento del paz y salvo para avisar.',
  'reglas.dias_vigencia_cert_existencia': 'Antigüedad máxima del certificado de existencia y representación antes de advertir.',
  notaria: 'Datos fijos de la notaría usados en las plantillas (código, notario titular, resolución de tarifas del año).',
  'ia.creditos': 'Saldo de créditos de la API de Claude (US$) tal como aparece en la consola de Anthropic (Billing) y la fecha en que se tomó (AAAA-MM-DD). Actualícelo cada vez que recargue. El saldo restante se calcula restando el costo real desde esa fecha.',
};

/**
 * La configuración se consulta en cada página (sesión: inactividad, IP de la oficina…). Se lee la
 * tabla completa en una sola consulta y se guarda en memoria unos segundos: así cada petición no
 * paga varios viajes a la base de datos. Un cambio desde el panel se aplica de inmediato en este
 * servidor (invalidarConfig) y en los demás a más tardar en TTL_CONFIG_MS.
 */
const TTL_CONFIG_MS = 30_000;
let enMemoria: { filas: Map<string, unknown>; vence: number } | undefined;
let cargando: Promise<Map<string, unknown>> | undefined;

function filasConfig(): Promise<Map<string, unknown>> {
  if (enMemoria && enMemoria.vence > Date.now()) return Promise.resolve(enMemoria.filas);
  if (cargando) return cargando;
  const gen = generacion;
  const p = db.configuracion.findMany()
    .then((filas) => {
      const m = new Map<string, unknown>(filas.map((f) => [f.clave, f.valor]));
      // Una lectura que empezó antes de un cambio no queda en memoria
      if (gen === generacion) enMemoria = { filas: m, vence: Date.now() + TTL_CONFIG_MS };
      return m;
    })
    .finally(() => { if (cargando === p) cargando = undefined; });
  cargando = p;
  return p;
}
let generacion = 0;

/** Descarta la configuración en memoria (después de guardar un cambio) */
export function invalidarConfig(): void {
  generacion++;
  enMemoria = undefined;
  cargando = undefined;
}

export async function obtenerConfig<K extends keyof Configuraciones>(clave: K): Promise<Configuraciones[K]> {
  return ((await filasConfig()).get(clave) as Configuraciones[K] | null | undefined) ?? POR_DEFECTO[clave];
}

export async function todasConfig(): Promise<Configuraciones> {
  const filas = await filasConfig();
  const r = { ...POR_DEFECTO } as Record<string, unknown>;
  for (const [clave, valor] of filas) if (clave in r) r[clave] = valor;
  return r as unknown as Configuraciones;
}
