/**
 * Se ejecuta antes de cada petición:
 *  - Política de seguridad de contenido (CSP) con nonce por petición (OWASP A03/A05).
 *  - Redirección temprana al ingreso si no hay cookie de sesión (la validación real
 *    de la sesión, el equipo y la red se hace en el servidor en cada página y acción).
 */
import { NextResponse, type NextRequest } from 'next/server';

const PUBLICAS = ['/ingreso', '/verificacion', '/configurar-2fa', '/cambiar-contrasena', '/registrar-equipo', '/instalacion'];

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // En producción todo va por HTTPS; PERMITIR_HTTP_LOCAL solo se usa en las pruebas de punta a punta en localhost
    ...(dev || process.env.PERMITIR_HTTP_LOCAL === 'true' ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const { pathname } = request.nextUrl;
  const esPublica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const tieneSesion = request.cookies.has('__Host-sesion') || request.cookies.has('sesion');
  if (!esPublica && !tieneSesion) {
    const url = request.nextUrl.clone();
    url.pathname = '/ingreso';
    url.search = '';
    const r = NextResponse.redirect(url);
    r.headers.set('Content-Security-Policy', csp);
    return r;
  }

  const cabeceras = new Headers(request.headers);
  cabeceras.set('x-nonce', nonce);
  cabeceras.set('Content-Security-Policy', csp);
  const respuesta = NextResponse.next({ request: { headers: cabeceras } });
  respuesta.headers.set('Content-Security-Policy', csp);
  respuesta.headers.set('Cache-Control', 'no-store'); // datos personales: nada en caché del navegador ni de intermediarios
  return respuesta;
}

export const config = {
  matcher: [{ source: '/((?!_next/static|_next/image|favicon.ico).*)' }],
};
