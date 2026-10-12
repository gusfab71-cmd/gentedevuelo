/* Service worker exclusivo para notificaciones de AeroChat. No almacena conversaciones. */
self.addEventListener('push', event => {
  let value = {};
  try { value = event.data ? event.data.json() : {}; } catch {}
  const title = 'AeroChat · Gente de Vuelo';
  const body = typeof value.body === 'string' && value.body.length < 140
    ? value.body : 'Tenés un nuevo aviso en AeroChat.';
  const destination = typeof value.url === 'string' ? value.url : '/aerochat.html';
  let url;
  try {
    const candidate = new URL(destination, self.location.origin);
    url = candidate.origin === 'https://gentedevuelo.com' || candidate.origin === self.location.origin
      ? candidate.href : new URL('/aerochat.html', self.location.origin).href;
  } catch { url = new URL('/aerochat.html', self.location.origin).href; }
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/logo%20circular%20recortado%20gente%20de%20vuelo.png',
    // Una sola notificación visible: las nuevas reemplazan a la anterior.
    // Sin interacción obligatoria, el navegador puede retirarla automáticamente.
    tag: 'gdv-aerochat',
    renotify: false,
    requireInteraction: false,
    data: { url }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destination = event.notification.data?.url || new URL('/aerochat.html', self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Never direct notifications to unrelated origins or user-supplied websites.
    const target = new URL(destination, self.location.origin);
    if (target.origin !== self.location.origin && target.origin !== 'https://gentedevuelo.com') return;
    const existing = tabs.find(tab => tab.url.startsWith(target.origin) && tab.url.includes('/aerochat.html'));
    if (existing) {
      await existing.navigate(target.href);
      return existing.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});
