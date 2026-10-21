/**
 * Cifrado en reposo (AES-256-GCM) para documentos, borradores y secretos TOTP,
 * y huellas HMAC para tokens de sesión y de dispositivo.
 *
 * Formato binario: [versión 1 byte][IV 12 bytes][etiqueta GCM 16 bytes][texto cifrado]
 * La clave maestra (CLAVE_MAESTRA) vive solo en el servidor; si se pierde, los
 * documentos no se pueden recuperar (ver README: custodia de claves).
 */
import crypto from 'node:crypto';

const VERSION = 1;

function clave(nombre: 'CLAVE_MAESTRA' | 'CLAVE_FIRMA'): Buffer {
  const b64 = process.env[nombre];
  if (!b64) throw new Error(`Falta la variable de entorno ${nombre}.`);
  const k = Buffer.from(b64, 'base64');
  if (k.length !== 32) throw new Error(`${nombre} debe tener 32 bytes codificados en base64.`);
  return k;
}

export function cifrar(datos: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave('CLAVE_MAESTRA'), iv);
  const cuerpo = Buffer.concat([c.update(datos), c.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, c.getAuthTag(), cuerpo]);
}

export function descifrar(paquete: Buffer): Buffer {
  if (paquete[0] !== VERSION) throw new Error('Formato de cifrado desconocido.');
  const iv = paquete.subarray(1, 13);
  const etiqueta = paquete.subarray(13, 29);
  const d = crypto.createDecipheriv('aes-256-gcm', clave('CLAVE_MAESTRA'), iv);
  d.setAuthTag(etiqueta);
  return Buffer.concat([d.update(paquete.subarray(29)), d.final()]); // falla si el archivo fue alterado
}

export const cifrarTexto = (t: string) => cifrar(Buffer.from(t, 'utf8')).toString('base64');
export const descifrarTexto = (b64: string) => descifrar(Buffer.from(b64, 'base64')).toString('utf8');

/** Huella con clave (HMAC-SHA256): lo que se guarda en la base de datos en lugar del token */
export const huellaToken = (token: string) => crypto.createHmac('sha256', clave('CLAVE_FIRMA')).update(token).digest('hex');

export const sha256 = (datos: Buffer | string) => crypto.createHash('sha256').update(datos).digest('hex');

/** Token aleatorio (256 bits) */
export const tokenAleatorio = () => crypto.randomBytes(32).toString('base64url');

/** Firma un token para la cookie: "token.firma" */
export function firmarToken(token: string): string {
  const firma = crypto.createHmac('sha256', clave('CLAVE_FIRMA')).update(`cookie:${token}`).digest('base64url');
  return `${token}.${firma}`;
}

/** Verifica la firma en tiempo constante; devuelve el token o null */
export function verificarTokenFirmado(valor: string | undefined | null): string | null {
  if (!valor) return null;
  const [token, firma] = valor.split('.');
  if (!token || !firma) return null;
  const esperada = crypto.createHmac('sha256', clave('CLAVE_FIRMA')).update(`cookie:${token}`).digest();
  const recibida = Buffer.from(firma, 'base64url');
  if (recibida.length !== esperada.length || !crypto.timingSafeEqual(recibida, esperada)) return null;
  return token;
}
