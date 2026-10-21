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
};

export async function obtenerConfig<K extends keyof Configuraciones>(clave: K): Promise<Configuraciones[K]> {
  const fila = await db.configuracion.findUnique({ where: { clave } });
  return (fila?.valor as Configuraciones[K] | undefined) ?? POR_DEFECTO[clave];
}

export async function todasConfig(): Promise<Configuraciones> {
  const filas = await db.configuracion.findMany();
  const r = { ...POR_DEFECTO } as Record<string, unknown>;
  for (const f of filas) if (f.clave in r) r[f.clave] = f.valor;
  return r as unknown as Configuraciones;
}
