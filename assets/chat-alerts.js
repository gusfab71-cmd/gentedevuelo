'use strict';
/*
 * Avisos de AeroChat disponibles desde cualquier sección de Gente de Vuelo.
 * Nunca expone el texto de mensajes privados ni usa datos de perfiles en HTML.
 */
(() => {
  if (!window.GDV_AUTH || !window.GDV_AUTH.client) return;
  const auth = window.GDV_AUTH;
  const db = auth.client;
  const root = new URL('../', document.currentScript.src);
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('assets/chat-alerts.css?v=20261011alertas1', root).href;
  document.head.append(css);

  const MAX_ALERTS = 3;
  const ALERT_LIFETIME_MS = 7000;
  const MAX_SEEN_MESSAGES = 600;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let user = null;
  let channel = null;
  let host = null;
  let active = false;
  let starting = false;
  let seeded = false;
  let busy = false;
  let publicId = 0;
  let privateId = 0;
  let notifications = [];
  let expiryTimer = null;
  const handled = new Set();
  const names = new Map();

  // Guardamos solamente los identificadores ya avisados, nunca las alertas
  // visuales ni el contenido de los mensajes. Esto evita repeticiones al
  // cambiar de página, recargar o tener varias pestañas abiertas.
  function seenStorageKey() { return 'gdv-aerochat-avisados-v2:' + user.id; }
  function readSeen() {
    if (!user) return [];
    try {
      const value = JSON.parse(localStorage.getItem(seenStorageKey()) || '[]');
      return Array.isArray(value)
        ? value.filter(v => typeof v === 'string' && /^(?:public|private):[1-9]\d*$/.test(v))
          .slice(-MAX_SEEN_MESSAGES)
        : [];
    } catch { return []; }
  }
  function markSeen(id) {
    if (handled.has(id)) return false;
    // Sincronizar lo visto en otras pestañas antes de mostrar otro aviso.
    for (const previous of readSeen()) handled.add(previous);
    if (handled.has(id)) return false;
    handled.add(id);
    while (handled.size > MAX_SEEN_MESSAGES) handled.delete(handled.values().next().value);
    try { localStorage.setItem(seenStorageKey(), JSON.stringify([...handled])); } catch {}
    return true;
  }

  function closeBrowserAlerts() {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.getRegistration('/aerochat-push-sw.js')
      .then(async reg => {
        if (!reg?.active?.scriptURL.includes('/aerochat-push-sw.js')) return;
        const notices = await reg.getNotifications();
        for (const notice of notices) notice.close();
      }).catch(() => {});
  }

  function isOpen(type, sender) {
    if (location.pathname.split('/').pop() !== 'aerochat.html') return false;
    if (type === 'public') {
      const general = document.getElementById('chat-public-panel');
      return Boolean(general && !general.hidden);
    }
    const privatePanel = document.getElementById('chat-private-panel');
    return Boolean(privatePanel && !privatePanel.hidden &&
      window.GDV_AEROCHAT_ACTIVE_PEER === sender);
  }
  function destination(n) {
    return new URL('aerochat.html' +
      (n.type === 'private' ? '?privado=' + encodeURIComponent(n.sender) : ''), root).href;
  }

  function mount() {
    if (host && host.isConnected) return;
    host = document.createElement('aside');
    host.id = 'gdv-chat-alert-host';
    host.setAttribute('aria-label', 'Alertas de AeroChat');
    const list = document.createElement('div');
    list.id = 'gdv-chat-alert-list';
    list.setAttribute('role', 'status');
    list.setAttribute('aria-live', 'polite');
    list.setAttribute('aria-atomic', 'false');
    host.append(list);
    document.body.append(host);
  }
  function render() {
    if (!user) return;
    if (expiryTimer !== null) { clearTimeout(expiryTimer); expiryTimer = null; }
    notifications = notifications.filter(n => Date.now() - n.at < ALERT_LIFETIME_MS);
    mount();
    const list = host.querySelector('#gdv-chat-alert-list');
    const fragment = document.createDocumentFragment();
    for (const n of notifications) {
      if (isOpen(n.type, n.sender)) continue;
      const card = document.createElement('section');
      card.className = 'gdv-chat-alert-card';
      const link = document.createElement('a');
      link.className = 'gdv-chat-alert-link';
      link.href = destination(n);
      link.setAttribute('aria-label', 'Abrir ' + (n.type === 'private' ? 'mensaje privado' : 'sala general') + ' de ' + n.name);
      const symbol = document.createElement('span');
      symbol.className = 'gdv-chat-alert-symbol';
      symbol.setAttribute('aria-hidden', 'true');
      symbol.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5a8 8 0 0 1-8 8c-1.2 0-2.4-.3-3.4-.8L3 21l1.9-5.2A8 8 0 1 1 20 11.5Z"/><path d="M8 10.8h8M8 14h5"/></svg>';
      const details = document.createElement('span');
      details.className = 'gdv-chat-alert-details';
      const title = document.createElement('strong');
      title.textContent = n.name;
      const subtitle = document.createElement('span');
      subtitle.textContent = n.count > 1
        ? n.count + (n.type === 'private' ? ' mensajes privados' : ' mensajes en la sala general')
        : (n.type === 'private' ? 'Nuevo mensaje privado' : 'Nuevo mensaje en AeroChat');
      details.append(title, subtitle);
      const chevron = document.createElement('span');
      chevron.className = 'gdv-chat-alert-chevron';
      chevron.textContent = '›';
      chevron.setAttribute('aria-hidden', 'true');
      link.append(symbol, details, chevron);
      link.addEventListener('click', () => {
        notifications = notifications.filter(v => v !== n);
        render();
      });
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'gdv-chat-alert-dismiss';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Cerrar aviso de ' + n.name);
      close.title = 'Cerrar aviso';
      close.addEventListener('click', () => {
        notifications = notifications.filter(v => v !== n);
        render();
      });
      card.append(link, close);
      fragment.append(card);
    }
    list.replaceChildren(fragment);
    host.hidden = !list.childElementCount;
    if (notifications.length) {
      const remaining = Math.min(...notifications.map(n => n.at + ALERT_LIFETIME_MS - Date.now()));
      expiryTimer = setTimeout(render, Math.max(1, remaining + 10));
    }
  }

  async function nameOf(id) {
    if (names.has(id)) return names.get(id);
    let label = 'Integrante';
    try {
      const r = await db.from('profiles').select('username')
        .eq('id', id).maybeSingle();
      if (!r.error && r.data && typeof r.data.username === 'string') {
        label = r.data.username.trim().slice(0, 80) || label;
      }
    } catch {}
    names.set(id, label);
    return label;
  }

  async function incoming(type, row) {
    if (!active || !user || !row) return;
    const id = Number(row.id);
    const sender = type === 'private' ? row.sender_id : row.author_id;
    if (!Number.isSafeInteger(id) || id < 1 || !UUID.test(sender) ||
        sender === user.id ||
        (type === 'private' && row.recipient_id !== user.id)) return;
    const viewer = user.id;
    if (!markSeen(type + ':' + id)) return;
    if (isOpen(type, sender)) return;
    const label = await nameOf(sender);
    if (!active || !user || user.id !== viewer || isOpen(type, sender)) return;
    // Agregar mensajes sucesivos del mismo integrante en una sola alerta.
    const existing = notifications.find(n => n.type === type && n.sender === sender);
    if (existing) {
      existing.count += 1;
      existing.at = Date.now();
      existing.id = id;
      existing.name = label;
      notifications = [existing, ...notifications.filter(n => n !== existing)];
    } else {
      notifications.unshift({type, sender, name:label, id, count:1, at:Date.now()});
    }
    notifications = notifications.slice(0, MAX_ALERTS);
    render();
  }

  async function seed() {
    const [pub, priv] = await Promise.all([
      db.from('gdv_chat_messages').select('id').order('id', {ascending:false}).limit(1),
      db.from('gdv_private_messages').select('id').eq('recipient_id',user.id)
        .order('id',{ascending:false}).limit(1)
    ]);
    if (pub.error || priv.error) throw pub.error || priv.error;
    publicId = Number(pub.data[0]?.id || 0);
    privateId = Number(priv.data[0]?.id || 0);
  }

  async function poll() {
    if (!active || !user || busy || document.hidden) return;
    busy = true;
    try {
      if (!seeded) { await seed(); seeded = true; return; }
      const [pub, priv] = await Promise.all([
        db.from('gdv_chat_messages').select('id,author_id,created_at')
          .gt('id', publicId).order('id', {ascending:true}).limit(50),
        db.from('gdv_private_messages').select('id,sender_id,recipient_id,created_at')
          .eq('recipient_id',user.id).gt('id',privateId)
          .order('id',{ascending:true}).limit(50)
      ]);
      if (pub.error || priv.error) return;
      for (const row of pub.data || []) {
        publicId = Math.max(publicId,Number(row.id));
        await incoming('public',row);
      }
      for (const row of priv.data || []) {
        privateId = Math.max(privateId,Number(row.id));
        await incoming('private',row);
      }
    } catch {
      // La suscripción en tiempo real sigue funcionando aunque falle la consulta.
    } finally {
      busy = false;
    }
  }

  function stop() {
    if (expiryTimer !== null) { clearTimeout(expiryTimer); expiryTimer = null; }
    active = false;
    seeded = false;
    if (channel) { db.removeChannel(channel); channel = null; }
    notifications = [];
    handled.clear();
    if (host) { host.remove(); host = null; }
    user = null;
  }

  async function start() {
    if (active || starting) return;
    starting = true;
    try {
    await auth.ready;
    const validated = await auth.validate().catch(() => null);
    if (!validated || auth.needsOnboarding() || !validated.email_confirmed_at) return;
    user = validated;
    active = true;
    notifications = [];
    handled.clear();
    for (const seen of readSeen()) handled.add(seen);
    closeBrowserAlerts();
    try { await seed(); seeded = true; }
    catch { seeded = false; }
    if (!active) return;
    channel = db.channel('gdv-chat-alerts-' + user.id)
      .on('postgres_changes', {event:'INSERT', schema:'public',table:'gdv_chat_messages'},
        payload => { void incoming('public',payload.new); })
      .on('postgres_changes', {event:'INSERT', schema:'public',table:'gdv_private_messages',
        filter:'recipient_id=eq.'+user.id},
        payload => { void incoming('private',payload.new); })
      .subscribe(() => { if (active) void poll(); });
    // Respaldo ante desconexiones; las alertas previas al ingreso nunca aparecen de golpe.
    void poll();
    } finally { starting = false; }
  }

  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', event => { if (event.persisted && !active) void start(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && active) {
      closeBrowserAlerts();
      render();
      void poll();
    }
  });
  window.addEventListener('hashchange', () => { if (active) render(); });
  window.addEventListener('focus', () => { if (active) closeBrowserAlerts(); });
  setInterval(() => {
    if (active && !document.hidden) {
      closeBrowserAlerts();
      void poll();
    }
  }, 20000);
  db.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      stop();
      // El navegador compartido deja de recibir avisos de la sesión anterior.
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.getRegistration('/aerochat-push-sw.js')
          .then(reg => reg?.active?.scriptURL.includes('/aerochat-push-sw.js')
            ? reg.pushManager.getSubscription() : null)
          .then(subscription => subscription?.unsubscribe())
          .catch(() => {});
      }
    }
    else if (event === 'SIGNED_IN' && !active) setTimeout(() => { void start(); }, 800);
  });
  void start();
})();