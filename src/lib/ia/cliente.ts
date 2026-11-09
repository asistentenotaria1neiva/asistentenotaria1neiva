/**
 * Cliente de la API de Claude (solo servidor). La clave vive en ANTHROPIC_API_KEY.
 * Cada tarea usa el modelo más económico que la resuelve bien; el modelo y el esfuerzo de
 * razonamiento se pueden cambiar por variables de entorno, sin cambiar código:
 *   - EXTRACCION (leer documentos): Haiku, CLAUDE_MODELO_DOCUMENTOS / CLAUDE_ESFUERZO_DOCUMENTOS;
 *   - REVISION (asistente, revisión y corrección del expediente): Sonnet, CLAUDE_MODELO_EXPEDIENTE / CLAUDE_ESFUERZO_EXPEDIENTE;
 *   - REDACCION (redactar la escritura sobre la plantilla aprobada): Sonnet, CLAUDE_MODELO_REDACCION / CLAUDE_ESFUERZO_REDACCION;
 *   - PLANTILLA (revisar y corregir plantillas): Sonnet, CLAUDE_MODELO_PLANTILLAS / CLAUDE_ESFUERZO_PLANTILLAS.
 * Si Haiku declina el contenido, se repite una vez con CLAUDE_MODELO_RESPALDO.
 */
import 'server-only';
import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { db } from '../db';
import { costoEstimadoUSD } from './precios';

type Esfuerzo = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Proposito = 'EXTRACCION' | 'REVISION' | 'REDACCION' | 'PLANTILLA';

const PREDETERMINADOS: Record<Proposito, { variable: string; modelo: string; esfuerzo: Esfuerzo }> = {
  EXTRACCION: { variable: 'DOCUMENTOS', modelo: 'claude-haiku-5-5', esfuerzo: 'medium' },
  REVISION: { variable: 'EXPEDIENTE', modelo: 'claude-sonnet-5-5', esfuerzo: 'medium' },
  REDACCION: { variable: 'REDACCION', modelo: 'claude-sonnet-5-5', esfuerzo: 'medium' },
  PLANTILLA: { variable: 'PLANTILLAS', modelo: 'claude-sonnet-5-5', esfuerzo: 'medium' },
};
const RESPALDO = 'claude-sonnet-5-5';

export function configuracionModelo(proposito: Proposito): { modelo: string; esfuerzo: Esfuerzo } {
  const d = PREDETERMINADOS[proposito];
  const modelo = process.env[`CLAUDE_MODELO_${d.variable}`]?.trim() || d.modelo;
  const e = (process.env[`CLAUDE_ESFUERZO_${d.variable}`]?.trim() || d.esfuerzo) as Esfuerzo;
  return { modelo, esfuerzo: ['low', 'medium', 'high', 'xhigh', 'max'].includes(e) ? e : d.esfuerzo };
}

/** Haiku no tiene respaldo del servidor ante rechazos: la llamada se repite con otro modelo */
const tieneRespaldoServidor = (modelo: string) => !modelo.startsWith('claude-haiku');

let cliente: Anthropic | undefined;
function obtenerCliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new ErrorIA('La clave de la API de Claude no está configurada en el servidor (ANTHROPIC_API_KEY).', 'CONFIGURACION');
  // Las claves sin workspace asignado exigen indicar el workspace en cada solicitud.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  cliente ??= new Anthropic({
    maxRetries: 3,
    timeout: 10 * 60 * 1000,
    defaultHeaders: workspace ? { 'anthropic-workspace-id': workspace } : undefined,
  });
  return cliente;
}

export class ErrorIA extends Error {
  constructor(
    message: string,
    public codigo: 'CONFIGURACION' | 'RECHAZO' | 'TRUNCADO' | 'FORMATO' | 'API',
    /** TRUNCADO: el texto (JSON incompleto) que alcanzó a escribir la IA, para rescatar lo completo */
    public parcial?: string,
    /** TRUNCADO: consumo de la llamada cortada */
    public uso?: { modelo: string; tokensEntrada: number; tokensSalida: number; tokensCacheLectura: number; duracionMs: number },
  ) {
    super(message);
  }
}

/** Traduce los errores del SDK a mensajes para el usuario; los demás se relanzan tal cual */
function errorDeApi(e: unknown): unknown {
  if (e instanceof Anthropic.AuthenticationError) return new ErrorIA('La clave de la API de Claude no es válida.', 'CONFIGURACION');
  if (e instanceof Anthropic.RateLimitError) return new ErrorIA('La API de Claude está limitando las solicitudes; intente de nuevo en unos minutos.', 'API');
  if (e instanceof Anthropic.BadRequestError) return new ErrorIA(`Solicitud rechazada por la API: ${e.message}`, 'API');
  if (e instanceof Anthropic.APIError) return new ErrorIA(`Error de la API de Claude (${e.status ?? 'sin estado'}).`, 'API');
  return e;
}

export interface ResultadoLlamada<T> {
  datos: T;
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  tokensCacheLectura: number;
  duracionMs: number;
}

/**
 * Llamada con salida estructurada (JSON validado contra el esquema por la API).
 * - Prompt de sistema con caché (estable entre llamadas del mismo propósito).
 * - Streaming para documentos grandes, sin riesgo de tiempo de espera HTTP.
 * - Respaldo ante rechazos por política: el del servidor (CLAUDE_FALLBACKS=default) o, con Haiku,
 *   una segunda llamada con CLAUDE_MODELO_RESPALDO.
 */
export async function llamarEstructurado<T>(opciones: OpcionesLlamada): Promise<ResultadoLlamada<T>> {
  const config = configuracionModelo(opciones.proposito);
  const modelo = config.modelo;
  const esfuerzo = opciones.esfuerzo ?? config.esfuerzo;
  try {
    return await llamar<T>(opciones, modelo, esfuerzo);
  } catch (e) {
    const respaldo = process.env.CLAUDE_MODELO_RESPALDO?.trim() || RESPALDO;
    if (!(e instanceof ErrorIA && e.codigo === 'RECHAZO') || tieneRespaldoServidor(modelo) || respaldo === modelo) throw e;
    return llamar<T>(opciones, respaldo, esfuerzo);
  }
}

interface OpcionesLlamada {
  proposito: Proposito;
  sistema: string;
  contenido: Anthropic.Beta.BetaContentBlockParam[];
  esquema: Record<string, unknown>;
  maxTokens?: number;
  /** Esfuerzo de razonamiento para esta llamada (p. ej. 'low' para identificar un documento); si no, el del propósito */
  esfuerzo?: Esfuerzo;
  /**
   * Cantidad de bloques iniciales de `contenido` que se repiten igual en llamadas seguidas (p. ej. los
   * documentos del negocio en cada parte de una redacción): quedan en caché 5 minutos y la siguiente
   * llamada los paga al 10 %. Escribir la caché cuesta un 25 % más, así que solo conviene si hay
   * otra llamada con el mismo inicio antes de 5 minutos.
   */
  cachearBloques?: number;
  /** A quién y a qué se carga el consumo de esta llamada (panel Consumo de IA) */
  registro: RegistroConsumo;
}

export interface RegistroConsumo {
  usuarioId?: string | null;
  expedienteId?: string | null;
  plantillaId?: string | null;
  analisisId?: string | null;
}

/** Guarda los tokens y el costo de una llamada. Un fallo al registrar nunca interrumpe el trabajo. */
async function registrarConsumo(opciones: OpcionesLlamada, mensaje: Anthropic.Beta.BetaMessage): Promise<void> {
  const u = mensaje.usage;
  const entrada = u.input_tokens ?? 0;
  const salida = u.output_tokens ?? 0;
  const cacheLectura = u.cache_read_input_tokens ?? 0;
  const cacheEscritura = u.cache_creation_input_tokens ?? 0;
  try {
    await db.consumoIA.create({
      data: {
        usuarioId: opciones.registro.usuarioId ?? null,
        expedienteId: opciones.registro.expedienteId ?? null,
        plantillaId: opciones.registro.plantillaId ?? null,
        analisisId: opciones.registro.analisisId ?? null,
        proposito: opciones.proposito,
        modelo: mensaje.model,
        tokensEntrada: entrada,
        tokensSalida: salida,
        tokensCacheLectura: cacheLectura,
        tokensCacheEscritura: cacheEscritura,
        costoUSD: costoEstimadoUSD(mensaje.model, entrada, salida, cacheLectura, cacheEscritura),
      },
    });
  } catch (e) {
    console.error('[ia] no se pudo registrar el consumo', e);
  }
}

/** Marca el último de los primeros `n` bloques como punto de caché (los bloques no se modifican) */
function conCache(contenido: Anthropic.Beta.BetaContentBlockParam[], n?: number): Anthropic.Beta.BetaContentBlockParam[] {
  if (!n || n < 1 || n > contenido.length) return contenido;
  return contenido.map((b, i) => (i === n - 1 ? ({ ...b, cache_control: { type: 'ephemeral' } } as Anthropic.Beta.BetaContentBlockParam) : b));
}

async function llamar<T>(opciones: OpcionesLlamada, modelo: string, esfuerzo: Esfuerzo): Promise<ResultadoLlamada<T>> {
  const usarRespaldo = tieneRespaldoServidor(modelo) && (process.env.CLAUDE_FALLBACKS ?? 'default') === 'default';
  const inicio = Date.now();
  let mensaje: Anthropic.Beta.BetaMessage;
  try {
    const stream = obtenerCliente().beta.messages.stream({
      model: modelo,
      max_tokens: opciones.maxTokens ?? 32000,
      system: [{ type: 'text', text: opciones.sistema, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: conCache(opciones.contenido, opciones.cachearBloques) }],
      output_config: { effort: esfuerzo, format: { type: 'json_schema', schema: opciones.esquema } },
      ...(usarRespaldo ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
    mensaje = await stream.finalMessage();
  } catch (e) {
    throw errorDeApi(e);
  }
  // Se cobra aunque la respuesta se rechace, quede truncada o no sirva: se registra siempre
  await registrarConsumo(opciones, mensaje);
  if (mensaje.stop_reason === 'refusal') throw new ErrorIA('El modelo declinó analizar este contenido. Revise el documento manualmente.', 'RECHAZO');
  const textoRespuesta = mensaje.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
  if (mensaje.stop_reason === 'max_tokens') {
    throw new ErrorIA('La respuesta de la IA quedó incompleta (límite de longitud).', 'TRUNCADO', textoRespuesta, {
      modelo: mensaje.model, tokensEntrada: mensaje.usage.input_tokens, tokensSalida: mensaje.usage.output_tokens,
      tokensCacheLectura: mensaje.usage.cache_read_input_tokens ?? 0, duracionMs: Date.now() - inicio,
    });
  }
  let datos: T;
  try {
    datos = JSON.parse(textoRespuesta) as T;
  } catch {
    throw new ErrorIA('La respuesta de la IA no tiene el formato esperado.', 'FORMATO');
  }
  return {
    datos,
    modelo: mensaje.model,
    tokensEntrada: mensaje.usage.input_tokens,
    tokensSalida: mensaje.usage.output_tokens,
    tokensCacheLectura: mensaje.usage.cache_read_input_tokens ?? 0,
    duracionMs: Date.now() - inicio,
  };
}

/**
 * Un PDF de más de esto no cabe en la solicitud (32 MB, y en base64 crece un tercio): se sube antes
 * por la Files API (hasta 500 MB) y la solicitud solo lleva su referencia.
 */
const LIMITE_PDF_EN_LINEA = 20 * 1024 * 1024;
const LIMITE_FILES_API = 500 * 1024 * 1024;

export interface DocumentoParaIA {
  bloque: Anthropic.Beta.BetaContentBlockParam;
  /** Borra de Anthropic el archivo subido, si lo hubo. Llamarlo siempre al terminar (también si falla). */
  liberar: () => Promise<void>;
}

/**
 * Prepara un documento para enviarlo a la IA: en la solicitud si cabe; si es un PDF grande, por la
 * Files API. El archivo se sube con un nombre genérico (no el del documento), vence a la hora por si
 * no se pudiera borrar y se borra en cuanto termina el análisis (liberar).
 */
export async function prepararDocumento(bytes: Buffer, mime: string, titulo: string): Promise<DocumentoParaIA> {
  if (mime !== 'application/pdf' || bytes.length <= LIMITE_PDF_EN_LINEA) return { bloque: bloqueDocumento(bytes, mime, titulo), liberar: async () => {} };
  if (bytes.length > LIMITE_FILES_API) throw new ErrorIA(`El PDF pesa ${(bytes.length / 1024 / 1024).toFixed(0)} MB y la IA analiza hasta 500 MB: quedó cargado, pero sus datos deben ingresarse a mano (o cárguelo dividido).`, 'FORMATO');
  const api = obtenerCliente();
  let id: string;
  try {
    id = (await api.files.upload({ file: await toFile(bytes, 'documento.pdf', { type: 'application/pdf' }), expires_in_seconds: 3600 })).id;
  } catch (e) {
    throw errorDeApi(e);
  }
  return {
    bloque: { type: 'document', source: { type: 'file', file_id: id }, title: titulo },
    liberar: () => api.files.delete(id).then(() => undefined, (e) => console.error('[ia] no se pudo borrar el archivo subido (vence en una hora)', id, e)),
  };
}

/** Bloque de contenido para un documento (PDF o imagen) que viaja dentro de la solicitud */
export function bloqueDocumento(bytes: Buffer, mime: string, titulo: string): Anthropic.Beta.BetaContentBlockParam {
  // Las imágenes se analizan hasta 5 MB; los PDF grandes van por prepararDocumento (Files API).
  const mb = bytes.length / 1024 / 1024;
  if (mime !== 'application/pdf' && mb > 5) throw new ErrorIA(`La imagen pesa ${mb.toFixed(1)} MB y la IA analiza hasta 5 MB: quedó cargada, pero sus datos deben ingresarse a mano (o cárguela con menor resolución o como PDF).`, 'FORMATO');
  const data = bytes.toString('base64');
  if (mime === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data }, title: titulo };
  }
  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif') {
    return { type: 'image', source: { type: 'base64', media_type: mime, data } };
  }
  throw new ErrorIA(`Formato no soportado para análisis: ${mime}`, 'FORMATO');
}
