/*
 * Service worker de los avisos push (src/lib/servicios/push.ts). Muestra cada notificación como
 * aviso de Windows aunque la pestaña esté dormida o cerrada, y al pulsarlo abre la escritura.
 * Si la persona está mirando la aplicación no muestra nada: ahí ya aparece el aviso dentro de la página.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (evento) => {
  let aviso;
  try { aviso = evento.data ? evento.data.json() : null; } catch { aviso = null; }
  if (!aviso) return;
  evento.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (ventanas.some((v) => v.focused && v.visibilityState === 'visible')) return;
    await self.registration.showNotification(aviso.titulo, {
      body: aviso.mensaje,
      tag: aviso.id,
      lang: 'es',
      icon: '/apple-icon.png',
      data: { enlace: aviso.enlace || '/notificaciones' },
    });
  })());
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.enlace || '/notificaciones', self.location.origin).href;
  evento.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const abierta = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
    if (abierta) {
      // La página navega con su propio enrutador (Avisos.tsx escucha este mensaje)
      abierta.postMessage({ tipo: 'abrir-aviso', enlace: destino });
      await abierta.focus().catch(() => {});
      return;
    }
    await self.clients.openWindow(destino);
  })());
});
