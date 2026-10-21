/**
 * Doble factor TOTP (compatible con Google Authenticator, Microsoft Authenticator, etc.).
 * El secreto se guarda cifrado; un mismo código no puede usarse dos veces.
 */
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { cifrarTexto, descifrarTexto, sha256 } from './cifrado';

export function nuevoSecreto(): { secreto: string; secretoCifrado: string } {
  const secreto = generateSecret();
  return { secreto, secretoCifrado: cifrarTexto(secreto) };
}

export async function codigoQR(secreto: string, usuario: string): Promise<string> {
  const uri = generateURI({ issuer: 'Notaría Primera de Neiva', label: usuario, secret: secreto });
  return QRCode.toDataURL(uri, { margin: 1, width: 220 });
}

/**
 * Verifica un código. Devuelve la huella del código aceptado (para guardarla y evitar reutilización)
 * o null si no es válido o ya se usó.
 */
export async function verificarCodigo(secretoCifrado: string, codigo: string, ultimoCodigoHash?: string | null): Promise<string | null> {
  const limpio = codigo.replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpio)) return null;
  const huella = sha256(`${secretoCifrado.slice(0, 16)}:${limpio}`);
  if (ultimoCodigoHash && ultimoCodigoHash === huella) return null; // repetición
  const r = await verify({ secret: descifrarTexto(secretoCifrado), token: limpio, epochTolerance: 30 });
  return r.valid ? huella : null;
}
