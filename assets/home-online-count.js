'use strict';
(() => {
  const badges = [...document.querySelectorAll('[data-gdv-online-badge]')];
  if (!badges.length || !window.GDV_AUTH?.client) return;

  const db = window.GDV_AUTH.client;
  const ACTIVITY_WINDOW_MS = 90000; // Misma ventana de actividad que AeroChat.
  const REFRESH_MS = 30000;
  let busy = false;

  async function refreshOnlineCount() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const since = new Date(Date.now() - ACTIVITY_WINDOW_MS).toISOString();
      // Solo se obtiene el total, nunca nombres ni identificadores.
      const { count, error } = await db.from('gdv_member_presence')
        .select('user_id', { count: 'exact', head: true })
        .gt('last_seen', since);
      if (error || !Number.isInteger(count) || count < 0) throw error || Error('Recuento no disponible');

      badges.forEach(badge => {
        const number = badge.querySelector('[data-gdv-online-number]');
        if (!number) return;
        number.textContent = String(count);
        badge.title = count === 1 ? '1 integrante conectado en vivo' : count + ' integrantes conectados en vivo';
        badge.setAttribute('aria-label', badge.title);
        badge.hidden = false;
      });
    } catch (error) {
      // No sustituir un fallo de conexión por un 0 que sería engañoso.
      badges.forEach(badge => {
        badge.hidden = true;
        badge.removeAttribute('title');
      });
      console.warn('No se pudo actualizar el contador de integrantes conectados.');
    } finally {
      busy = false;
    }
  }

  const start = () => {
    refreshOnlineCount();
    window.setInterval(refreshOnlineCount, REFRESH_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshOnlineCount();
    });
    window.addEventListener('focus', refreshOnlineCount);
  };
  if (window.GDV_AUTH.ready?.then) {
    window.GDV_AUTH.ready.then(start).catch(start);
  } else {
    start();
  }
})();
