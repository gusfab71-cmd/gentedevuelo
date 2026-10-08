'use strict';
(() => {
  // Ventana opcional para los comunicados globales; no modifica el resto de las notificaciones.
  if (!window.GDV_AUTH?.client || !window.GDV_AUTH?.ready) return;
  const auth = window.GDV_AUTH;
  const db = auth.client;
  const prefix = 'COMUNICADO · ';
  const pendingInMemory = new Set();
  let lastUserId = null;
  let loading = false;

  const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const popupKey = (uid, id) => 'gdv-comunicado-visto-en-sesion:' + uid + ':' + id;
  function alreadyDisplayed(uid, id) {
    const key = popupKey(uid, id);
    if (pendingInMemory.has(key)) return true;
    try { return sessionStorage.getItem(key) === '1'; } catch { return false; }
  }
  function rememberDisplayed(uid, id) {
    const key = popupKey(uid, id);
    pendingInMemory.add(key);
    try { sessionStorage.setItem(key, '1'); } catch {}
  }
  function resetSessionFlag() {
    for (const key of pendingInMemory) {
      try { sessionStorage.removeItem(key); } catch {}
    }
    pendingInMemory.clear();
    lastUserId = null;
  }

  const popup = document.createElement('dialog');
  popup.id = 'gdv-comunicado-dialog';
  popup.setAttribute('aria-labelledby', 'gdv-comunicado-titulo');
  document.body.appendChild(popup);

  function closePopup() { if (popup.open) popup.close(); }
  async function acknowledge(id, uid, button) {
    button.disabled = true;
    const result = await db.from('gdv_notifications')
      .update({ read: true }).eq('id', id).eq('user_id', uid);
    if (result.error) {
      const status = popup.querySelector('#gdv-comunicado-estado');
      if (status) status.textContent = 'No se pudo marcar como leído. Podés consultarlo en Notificaciones.';
      button.disabled = false;
      return;
    }
    closePopup();
    window.dispatchEvent(new Event('gdv:notifications-updated'));
  }
  function renderPopup(item, uid) {
    if (popup.open || document.querySelector('dialog[open]')) return false;
    const raw = item.message.slice(prefix.length);
    const separator = raw.indexOf('\n');
    const title = separator === -1 ? 'Novedades de Gente de Vuelo' : raw.slice(0, separator);
    const content = separator === -1 ? raw : raw.slice(separator + 1);
    const date = item.created_at
      ? new Date(item.created_at).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' })
      : '';

    popup.innerHTML = `
      <section class="gdv-comunicado-contenido">
        <div class="gdv-comunicado-etiqueta">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11v2a2 2 0 0 0 2 2h2l2 5h3l-2-5h2l8 4V5l-8 4H5a2 2 0 0 0-2 2Zm17-2a3 3 0 0 1 0 6"/></svg>
          Comunicado de Gente de Vuelo
        </div>
        <button type="button" class="gdv-comunicado-cerrar" aria-label="Cerrar comunicado">×</button>
        <h2 id="gdv-comunicado-titulo">${htmlEscape(title)}</h2>
        <p class="gdv-comunicado-mensaje">${htmlEscape(content)}</p>
        <p class="gdv-comunicado-fecha">${htmlEscape(date)}</p>
        <div class="gdv-comunicado-acciones">
          <button type="button" id="gdv-comunicado-entendido" class="gdv-comunicado-principal">Entendido</button>
          <button type="button" id="gdv-comunicado-ver-todas" class="gdv-comunicado-secundario">Ver notificaciones</button>
        </div>
        <p class="gdv-comunicado-ayuda">También podés leer este mensaje más tarde desde Mi cuenta → Notificaciones.</p>
        <p id="gdv-comunicado-estado" role="status" aria-live="polite"></p>
      </section>`;
    popup.querySelector('.gdv-comunicado-cerrar').addEventListener('click', closePopup);
    popup.querySelector('#gdv-comunicado-entendido')
      .addEventListener('click', event => acknowledge(item.id, uid, event.currentTarget));
    popup.querySelector('#gdv-comunicado-ver-todas').addEventListener('click', () => {
      closePopup();
      window.location.href = new URL('comunidad.html#notificaciones', window.location.href).href;
    });
    try { popup.showModal(); } catch { return false; }
    popup.querySelector('#gdv-comunicado-entendido')?.focus();
    return true;
  }

  async function checkAnnouncements(user) {
    if (!user?.id || !user.email_confirmed_at || loading) return;
    if (window.GDV_AUTH.recovery || /^#(?:ingresar|registro|recuperar)(?:$|\/)/.test(location.hash)) return;
    if (location.hash === '#notificaciones') return;
    if (document.querySelector('dialog[open]')) return;
    loading = true;
    lastUserId = user.id;
    try {
      const result = await db.from('gdv_notifications')
        .select('id,message,created_at')
        .eq('user_id', user.id)
        .eq('read', false)
        .like('message', prefix + '%')
        .order('created_at', { ascending: false })
        .limit(1);
      if (result.error || !result.data?.length) return;
      const item = result.data[0];
      if (alreadyDisplayed(user.id, item.id)) return;
      if (renderPopup(item, user.id)) rememberDisplayed(user.id, item.id);
    } catch (err) {
      console.warn('No se pudo consultar el comunicado pendiente.', err);
    } finally {
      loading = false;
    }
  }

  auth.ready.then(checkAnnouncements).catch(() => {});
  db.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') {
      resetSessionFlag();
      closePopup();
      return;
    }
    if (event === 'SIGNED_IN') {
      // Supabase no permite operaciones async dentro del callback de Auth.
      setTimeout(() => auth.validate().then(checkAnnouncements).catch(() => {}), 0);
    }
  });
})();
