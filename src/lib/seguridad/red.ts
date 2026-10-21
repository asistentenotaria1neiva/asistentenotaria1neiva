/**
 * Restricción por red: el personal solo entra desde la IP pública de la oficina.
 * Detrás del proxy (Caddy) la IP real llega en X-Real-IP; solo se confía en esa
 * cabecera si CONFIAR_EN_PROXY=true (en producción el proxy la sobrescribe siempre).
 */
import 'server-only';
import { headers } from 'next/headers';

export async function ipCliente(): Promise<string> {
  const h = await headers();
  if (process.env.CONFIAR_EN_PROXY === 'true') {
    const real = h.get('x-real-ip');
    if (real) return real.trim();
  }
  // Sin proxy (desarrollo): Next no expone la IP del socket; se usa x-forwarded-for local o 127.0.0.1
  return (h.get('x-forwarded-for')?.split(',')[0] ?? '127.0.0.1').trim();
}

/** Compara IPv4/IPv6 exactas o rangos CIDR IPv4 (p. ej. 190.0.0.0/24) */
export function ipPermitida(ip: string, lista: string[]): boolean {
  if (!lista.length) return process.env.NODE_ENV !== 'production'; // sin lista: solo se permite en desarrollo
  const limpia = ip.replace(/^::ffff:/, '');
  return lista.some((entrada) => {
    if (!entrada.includes('/')) return entrada === limpia;
    const [base, bitsTxt] = entrada.split('/');
    const bits = Number(bitsTxt);
    const aNum = (x: string) => x.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(limpia) || !/^\d+\.\d+\.\d+\.\d+$/.test(base) || !(bits >= 0 && bits <= 32)) return false;
    const mascara = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (aNum(limpia) & mascara) === (aNum(base) & mascara);
  });
}

export async function agenteUsuario(): Promise<string> {
  return ((await headers()).get('user-agent') ?? '').slice(0, 300);
}
