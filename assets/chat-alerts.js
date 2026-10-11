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
  const handled = new Set();
  const names = new Map();

  function key() { return 'gdv-aerochat-alertas-v1:' + user.id; }

  function savedAlerts() {
    try {
      const value = JSON.parse(sessionStorage.getItem(key()) || '[]');
      if (!Array.isArray(value)) return [];
      return value.filter(n => n && UUID.test(n.sender) &&
        (n.type === 'private' || n.type === 'public') &&
        typeof n.id === 'number' && Number.isSafeInteger(n.id) && n.id > 0 &&
        typeof n.name === 'string' && n.name.length <= 100 &&
        typeof n.count === 'number' && n.count >= 1 &&
        Date.now() - Number(n.at) < 3600000).slice(0, MAX_ALERTS);
    } catch { return []; }
  }
  function remember() {
    if (!user) return;
    try { sessionStorage.setItem(key(), JSON.stringify(notifications)); } catch {}
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
        remember();
      });
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'gdv-chat-alert-dismiss';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Cerrar aviso de ' + n.name);
      close.title = 'Cerrar aviso';
      close.addEventListener('click', () => {
        notifications = notifications.filter(v => v !== n);
        remember();
        render();
      });
      card.append(link, close);
      fragment.append(card);
    }
    list.replaceChildren(fragment);
    host.hidden = !list.childElementCount;
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
    const seenKey = type + ':' + id;
    if (handled.has(seenKey)) return;
    handled.add(seenKey);
    if (handled.size > 500) handled.delete(handled.values().next().value);
    if (isOpen(type, sender)) return;
    const label = await nameOf(sender);
    if (!active || !user || isOpen(type, sender)) return;
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
    remember();
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
    if (user) { try { sessionStorage.removeItem(key()); } catch {} }
    active = false;
    seeded = false;
    if (channel) { db.removeChannel(channel); channel = null; }
    notifications = [];
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
    notifications = savedAlerts();
    // Verificar si estamos en la conversación que originó el aviso.
    notifications = notifications.filter(n => !isOpen(n.type, n.sender));
    remember();
    if (notifications.length) render();
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

  window.addEventListener('pagehide', () => {
    if (channel) { db.removeChannel(channel); channel = null; }
    active = false;
  });
  window.addEventListener('pageshow', event => { if (event.persisted && !active) void start(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      render();
      void poll();
    }
  });
  window.addEventListener('hashchange', () => { if (active) render(); });
  setInterval(() => { if (active) void poll(); }, 20000);
  db.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') stop();
    else if (event === 'SIGNED_IN' && !active) setTimeout(() => { void start(); }, 800);
  });
  void start();
})();