'use strict';
(() => {
  const db = window.GDV_AUTH.client;
  const list = document.getElementById('chat-messages');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-content');
  const button = document.getElementById('chat-submit');
  const count = document.getElementById('chat-count');
  const notice = document.getElementById('chat-notice');
  const status = document.getElementById('connection-status');
  const dot = document.getElementById('connection-dot');
  let currentUser = null;
  let staff = false;
  let channel = null;
  let loading = false;
  let refreshAgain = false;
  let initial = true;
  let sending = false;

  function report(message, ok) {
    notice.textContent = message || '';
    notice.classList.toggle('success', Boolean(ok));
  }
  function connection(text, online) {
    status.textContent = text;
    dot.classList.toggle('live', Boolean(online));
  }
  function updateButton() {
    count.textContent = String(input.value.length);
    button.disabled = !currentUser || sending || !input.value.trim() || input.value.trim().length > 500;
  }
  function timeLabel(value) {
    return new Date(value).toLocaleString('es-AR', {timeZone:'America/Argentina/Buenos_Aires',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  }
  function render(messages, memberNames) {
    const stayAtEnd = initial || list.scrollHeight - list.scrollTop - list.clientHeight < 110;
    list.replaceChildren();
    if (!messages.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Todavía no hay mensajes. ¡Iniciá la conversación!';
      list.append(empty);
    }
    for (const msg of messages) {
      const own = msg.author_id === currentUser.id;
      const item = document.createElement('article');
      item.className = 'msg' + (own ? ' own' : '');
      const head = document.createElement('div');
      head.className = 'msg-head';
      const who = document.createElement('span');
      who.className = 'msg-author';
      who.textContent = memberNames.get(msg.author_id) || 'Integrante';
      const when = document.createElement('time');
      when.className = 'msg-time';
      when.dateTime = msg.created_at;
      when.textContent = timeLabel(msg.created_at);
      head.append(who, when);
      const body = document.createElement('p');
      body.className = 'msg-content';
      body.textContent = msg.content;
      item.append(head, body);
      if (own || staff) {
        const actions = document.createElement('div');
        actions.className = 'msg-actions';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Eliminar';
        remove.setAttribute('aria-label', 'Eliminar mensaje de ' + who.textContent);
        remove.addEventListener('click', () => removeMessage(msg.id));
        actions.append(remove);
        item.append(actions);
      }
      list.append(item);
    }
    if (stayAtEnd) list.scrollTop = list.scrollHeight;
    initial = false;
  }
  async function refresh() {
    if (!currentUser || document.hidden) return;
    if (loading) { refreshAgain = true; return; }
    loading = true;
    try {
      const result = await db.from('gdv_chat_messages').select('id,author_id,content,created_at').order('created_at',{ascending:false}).limit(100);
      if (result.error) throw result.error;
      const messages = (result.data || []).reverse();
      const ids = [...new Set(messages.map(row => row.author_id))];
      const names = new Map();
      if (ids.length) {
        const p = await db.from('profiles').select('id,username').in('id', ids);
        if (!p.error) for (const person of p.data || []) names.set(person.id, person.username || 'Integrante');
      }
      render(messages, names);
    } catch (err) {
      report('No se pudieron cargar los mensajes. ' + (err.message || 'Reintentá en unos segundos.'));
      connection('Sin conexión', false);
    } finally {
      loading = false;
      if (refreshAgain) { refreshAgain = false; refresh(); }
    }
  }
  async function removeMessage(id) {
    if (!confirm('¿Eliminar este mensaje de la sala?')) return;
    const response = await db.from('gdv_chat_messages').delete().eq('id',id);
    if (response.error) report('No se pudo eliminar: ' + response.error.message);
    else { report('Mensaje eliminado.',true); await refresh(); }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!currentUser || sending) return;
    const content = input.value.trim();
    if (!content || content.length > 500) return;
    sending = true;
    updateButton();
    report('');
    try {
      const response = await db.from('gdv_chat_messages').insert({author_id:currentUser.id,content});
      if (response.error) throw response.error;
      input.value = '';
      report('');
      await refresh();
      input.focus();
    } catch (err) {
      report('No se envió el mensaje. ' + (err.message || 'Reintentá.'));
    } finally {
      sending = false;
      updateButton();
    }
  });
  input.addEventListener('input', updateButton);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('pagehide', () => { if (channel) db.removeChannel(channel); });
  setInterval(() => { if (!document.hidden) refresh(); }, 15000);

  async function start() {
    await window.GDV_AUTH.ready;
    currentUser = await window.GDV_AUTH.validate();
    if (!currentUser) { location.replace('comunidad.html#ingresar'); return; }
    const roleResults = await Promise.all([
      db.from('site_admins').select('user_id').eq('user_id',currentUser.id).limit(1),
      db.from('gdv_moderators').select('user_id').eq('user_id',currentUser.id).limit(1)
    ]);
    staff = roleResults.some(result => !result.error && result.data && result.data.length > 0);
    updateButton();
    await refresh();
    channel = db.channel('gdv-aerochat-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'gdv_chat_messages'},() => refresh())
      .subscribe(state => {
        if (state === 'SUBSCRIBED') connection('En vivo',true);
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED')
          connection('Reconectando · actualización automática',false);
      });
  }
  start().catch(err => { report('No se pudo iniciar AeroChat: ' + (err.message || 'Error de conexión.')); connection('Sin conexión',false); });
})();
