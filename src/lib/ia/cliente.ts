/**
 * Cliente de la API de Claude (solo servidor). La clave vive en ANTHROPIC_API_KEY.
 * El modelo y el esfuerzo de razonamiento se configuran por variables de entorno
 * para cada tarea (extracción y revisión), sin cambiar código.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

type Esfuerzo = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Proposito = 'EXTRACCION' | 'REVISION';

export function configuracionModelo(proposito: Proposito): { modelo: string; esfuerzo: Esfuerzo } {
  const sufijo = proposito === 'EXTRACCION' ? 'EXTRACCION' : 'REVISION';
  const modelo = process.env[`CLAUDE_MODELO_${sufijo}`] || 'claude-opus-5-5';
  const e = (process.env[`CLAUDE_ESFUERZO_${sufijo}`] || 'high') as Esfuerzo;
  return { modelo, esfuerzo: ['low', 'medium', 'high', 'xhigh', 'max'].includes(e) ? e : 'high' };
}

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
  constructor(message: string, public codigo: 'CONFIGURACION' | 'RECHAZO' | 'TRUNCADO' | 'FORMATO' | 'API') {
    super(message);
  }
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
 * - Respaldo del servidor ante rechazos por política, si CLAUDE_FALLBACKS=default.
 */
export async function llamarEstructurado<T>(opciones: {
  proposito: Proposito;
  sistema: string;
  contenido: Anthropic.Beta.BetaContentBlockParam[];
  esquema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<ResultadoLlamada<T>> {
  const { modelo, esfuerzo } = configuracionModelo(opciones.proposito);
  const usarRespaldo = (process.env.CLAUDE_FALLBACKS ?? 'default') === 'default';
  const inicio = Date.now();
  let mensaje: Anthropic.Beta.BetaMessage;
  try {
    const stream = obtenerCliente().beta.messages.stream({
      model: modelo,
      max_tokens: opciones.maxTokens ?? 32000,
      system: [{ type: 'text', text: opciones.sistema, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: opciones.contenido }],
      output_config: { effort: esfuerzo, format: { type: 'json_schema', schema: opciones.esquema } },
      ...(usarRespaldo ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
    mensaje = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ErrorIA('La clave de la API de Claude no es válida.', 'CONFIGURACION');
    if (e instanceof Anthropic.RateLimitError) throw new ErrorIA('La API de Claude está limitando las solicitudes; intente de nuevo en unos minutos.', 'API');
    if (e instanceof Anthropic.BadRequestError) throw new ErrorIA(`Solicitud rechazada por la API: ${e.message}`, 'API');
    if (e instanceof Anthropic.APIError) throw new ErrorIA(`Error de la API de Claude (${e.status ?? 'sin estado'}).`, 'API');
    throw e;
  }
  if (mensaje.stop_reason === 'refusal') throw new ErrorIA('El modelo declinó analizar este contenido. Revise el documento manualmente.', 'RECHAZO');
  if (mensaje.stop_reason === 'max_tokens') throw new ErrorIA('La respuesta de la IA quedó incompleta (límite de longitud).', 'TRUNCADO');
  const textoRespuesta = mensaje.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
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

/** Bloque de contenido para un documento (PDF o imagen) */
export function bloqueDocumento(bytes: Buffer, mime: string, titulo: string): Anthropic.Beta.BetaContentBlockParam {
  // Límites de la API: 32 MB por solicitud (el archivo viaja en base64, un tercio más grande) y 5 MB por imagen.
  // Los documentos se pueden cargar de cualquier tamaño; solo el análisis con IA queda limitado.
  const mb = bytes.length / 1024 / 1024;
  if (mime === 'application/pdf' && mb > 22) throw new ErrorIA(`El PDF pesa ${mb.toFixed(0)} MB y la IA analiza hasta 22 MB: quedó cargado, pero sus datos deben ingresarse a mano (o cárguelo dividido o comprimido).`, 'FORMATO');
  if (mime !== 'application/pdf' && mb > 5) throw new ErrorIA(`La imagen pesa ${mb.toFixed(1)} MB y la IA analiza hasta 5 MB: quedó cargada, pero sus datos deben ingresarse a mano (o cárguela con menor resolución).`, 'FORMATO');
  const data = bytes.toString('base64');
  if (mime === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data }, title: titulo };
  }
  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif') {
    return { type: 'image', source: { type: 'base64', media_type: mime, data } };
  }
  throw new ErrorIA(`Formato no soportado para análisis: ${mime}`, 'FORMATO');
}
