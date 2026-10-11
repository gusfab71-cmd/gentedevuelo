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
  const onlineCount = document.getElementById('online-count');
  const onlineUsers = document.getElementById('online-users');
  let currentUser = null;
  let staff = false;
  let channel = null;
  let onlineChannel = null;
  let onlineRequest = 0;

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

  function onlineUnavailable(text) {
    onlineRequest++;
    onlineCount.textContent = '—';
    const placeholder = document.createElement('li');
    placeholder.className = 'online-placeholder';
    placeholder.textContent = text;
    onlineUsers.replaceChildren(placeholder);
  }

  async function heartbeat() { await window.GDV_AUTH.heartbeat(); }

  async function updateOnlineList() {
    if (!currentUser) return;
    const request = ++onlineRequest;

    // Realtime presence indicates who is actually INSIDE this room.
    // Site presence indicates who is active anywhere in Gente de Vuelo.
    const state = onlineChannel ? onlineChannel.presenceState() : {};
    const roomIds = new Set(Object.values(state).flatMap(
      entries => Array.isArray(entries) ? entries.map(entry => entry.user_id) : []
    ).filter(id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)));

    const since = new Date(Date.now() - 90000).toISOString();
    const recent = await db.from('gdv_member_presence').select('user_id').gt('last_seen',since);
    if (request !== onlineRequest) return;
    if (recent.error) {
      onlineUnavailable('No se pudo consultar quién está conectado.');
      return;
    }
    const siteIds = [...new Set([
      ...(recent.data || []).map(person => person.user_id),
      ...roomIds,
      currentUser.id
    ])];
    const result = await db.from('profiles').select('id,username').in('id',siteIds);
    if (request !== onlineRequest) return;
    if (result.error) {
      onlineUnavailable('No se pudieron cargar los nombres de los integrantes.');
      return;
    }
    const people = (result.data || []).sort((a,b) => {
      if (a.id === currentUser.id) return -1;
      if (b.id === currentUser.id) return 1;
      return (a.username || '').localeCompare(b.username || '', 'es');
    });

    onlineCount.textContent = String(people.length) + ' conectados';
    const items = document.createDocumentFragment();
    for (const person of people) {
      const item = document.createElement('li');
      item.className = 'online-user';
      const indicator = document.createElement('span');
      indicator.className = 'online-indicator';
      indicator.setAttribute('aria-hidden','true');
      const link = document.createElement('a');
      link.href = 'comunidad.html#hangar/' + encodeURIComponent(person.id);
      link.textContent = person.username || 'Integrante';
      item.append(indicator,link);
      if (person.id !== currentUser.id) {
        const dmButton=document.createElement('button');dmButton.type='button';dmButton.className='dm-open';
        dmButton.textContent='Privado';dmButton.setAttribute('aria-label','Enviar mensaje privado a '+(person.username||'Integrante'));
        dmButton.addEventListener('click',()=>openPrivate(person.id));item.append(dmButton);
      }
      if (roomIds.has(person.id)) {
        const room = document.createElement('span');
        room.className = 'online-in-room';
        room.textContent = 'En sala';
        room.title = 'Está conectado a AeroChat';
        item.append(room);
      }
      if (person.id === currentUser.id) {
        const you = document.createElement('span');
        you.className = 'online-you';
        you.textContent = 'Vos';
        item.append(you);
      }
      items.append(item);
    }
    if (!people.length) {
      onlineUnavailable('Todavía no hay integrantes conectados.');
      return;
    }
    onlineUsers.replaceChildren(items);
  }


  // Mensajería directa: separada de la sala pública y con control de acceso en Postgres.
  const privateTab = document.getElementById('chat-mode-private');
  const publicTab = document.getElementById('chat-mode-general');
  const publicPanel = document.getElementById('chat-public-panel');
  const dmPanel = document.getElementById('chat-private-panel');
  const dmContacts = document.getElementById('dm-contacts');
  const dmSearch = document.getElementById('dm-search');
  const dmThread = document.getElementById('dm-messages');
  const dmPeerName = document.getElementById('dm-peer-name');
  const dmPeerHint = document.getElementById('dm-peer-hint');
  const dmNotice = document.getElementById('dm-notice');
  const dmForm = document.getElementById('dm-form');
  const dmInput = document.getElementById('dm-content');
  const dmSubmit = document.getElementById('dm-submit');
  const dmCount = document.getElementById('dm-count');
  const dmBlock = document.getElementById('dm-block');
  const dmBadge = document.getElementById('dm-unread-badge');
  const dmAcceptButton = document.getElementById('dm-accept-review');
  const dmAcceptStatus = document.getElementById('dm-accept-status');
  let dmConsentAccepted = false;
  async function refreshDmConsent() {
    if (!currentUser) return;
    const result = await db.from('gdv_private_review_ack').select('accepted_at').eq('member_id',currentUser.id).maybeSingle();
    if (result.error) {
      dmAcceptStatus.textContent='No se pudo verificar la aceptación: '+result.error.message;
      return;
    }
    dmConsentAccepted=Boolean(result.data?.accepted_at);
    dmAcceptButton.hidden=dmConsentAccepted;
    dmAcceptStatus.textContent=dmConsentAccepted
      ? 'Aviso aceptado. Los nuevos mensajes que envíes están sujetos a revisión administrativa justificada.'
      : 'Para enviar nuevos mensajes privados, leé y aceptá este aviso.';
    updatePrivateComposer();
  }
  dmAcceptButton.addEventListener('click',async()=>{
    if(!currentUser || dmConsentAccepted)return;
    dmAcceptButton.disabled=true;
    try{
      const result=await db.from('gdv_private_review_ack').insert({member_id:currentUser.id});
      if(result.error && result.error.code!=='23505')throw result.error;
      await refreshDmConsent();
    }catch(error){dmAcceptStatus.textContent='No se pudo registrar tu aceptación: '+(error.message||'Reintentá.')}
    finally{dmAcceptButton.disabled=false}
  });
  let dmDirectory = [];
  let dmRecent = [];
  let dmBlocks = new Set();
  let dmPeer = null;
  let dmActive = false;
  let dmInboxBusy = false;
  let dmSending = false;
  let dmThreadRequest = 0;

  function privateNotice(text) { dmNotice.textContent = text || ''; }
  function setChatMode(toPrivate) {
    dmActive = toPrivate;
    window.GDV_AEROCHAT_ACTIVE_PEER = toPrivate ? (dmPeer?.id || null) : null;
    publicPanel.hidden = toPrivate;
    dmPanel.hidden = !toPrivate;
    publicTab.classList.toggle('selected', !toPrivate);
    privateTab.classList.toggle('selected', toPrivate);
    publicTab.setAttribute('aria-pressed', String(!toPrivate));
    privateTab.setAttribute('aria-pressed', String(toPrivate));
    if (!toPrivate) refresh();
  }
  function updatePrivateComposer() {
    dmCount.textContent = String(dmInput.value.length);
    const blocked = Boolean(dmPeer && dmBlocks.has(dmPeer.id));
    dmForm.hidden = false;
    dmInput.disabled = !dmPeer || blocked || !dmConsentAccepted;
    dmInput.placeholder = !dmPeer ? 'Seleccioná un integrante para escribir…' : blocked ? 'Integrante bloqueado' : 'Escribí un mensaje privado…';
    dmBlock.hidden = !dmPeer;
    dmBlock.textContent = blocked ? 'Desbloquear' : 'Bloquear';
    dmSubmit.disabled = dmSending || !dmConsentAccepted || !dmPeer || !dmInput.value.trim() || dmInput.value.trim().length > 1000;
    dmPeerHint.textContent = !dmPeer
      ? 'Elegí a quién escribir. Revisá el aviso de privacidad antes de enviar.'
      : blocked ? 'Bloqueaste a este integrante. Desbloquealo para poder responder.'
      : !dmConsentAccepted ? 'Aceptá el aviso de revisión administrativa antes de enviar.'
      : 'Mensajes visibles para los participantes y sujetos a revisión administrativa justificada.';
  }
  function renderPrivateContacts() {
    const search = dmSearch.value.trim().toLocaleLowerCase('es');
    const latest = new Map();
    const unread = new Map();
    for (const msg of dmRecent) {
      const id = msg.sender_id === currentUser.id ? msg.recipient_id : msg.sender_id;
      if (!latest.has(id)) latest.set(id,new Date(msg.created_at).getTime());
      if (msg.recipient_id === currentUser.id && !msg.read_at) unread.set(id,(unread.get(id)||0)+1);
    }
    const people = dmDirectory.filter(p=>p.id !== currentUser.id && (p.username||'Integrante').toLocaleLowerCase('es').includes(search))
      .sort((a,b)=>(latest.get(b.id)||0)-(latest.get(a.id)||0) || (a.username||'').localeCompare(b.username||'','es'));
    const fragment = document.createDocumentFragment();
    for (const person of people) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dm-contact' + (dmPeer?.id === person.id ? ' active' : '');
      item.setAttribute('aria-pressed',String(dmPeer?.id===person.id));
      item.addEventListener('click', () => openPrivate(person.id));
      const label = document.createElement('span');
      label.textContent = person.username || 'Integrante';
      item.append(label);
      if(unread.has(person.id)){
        const pill = document.createElement('span');pill.className='dm-contact-unread';
        pill.textContent=String(unread.get(person.id));
        pill.setAttribute('aria-label',unread.get(person.id)+' mensajes sin leer');item.append(pill);
      }
      fragment.append(item);
    }
    if (!people.length) {
      const empty=document.createElement('p');empty.className='online-placeholder';
      empty.textContent=search?'No hay integrantes con ese nombre.':'Todavía no hay integrantes disponibles.';
      fragment.append(empty);
    }
    dmContacts.replaceChildren(fragment);
  }
  async function refreshPrivateInbox(){
    if (!currentUser || dmInboxBusy || document.hidden) return;
    dmInboxBusy=true;
    try{
      if(!dmDirectory.length){
        const users=await db.from('profiles').select('id,username').eq('onboarding_completed',true).order('username');
        if(users.error)throw users.error;
        dmDirectory=users.data||[];
      }
      const [messages,blocks]=await Promise.all([
        db.from('gdv_private_messages').select('sender_id,recipient_id,created_at,read_at')
          .or('sender_id.eq.'+currentUser.id+',recipient_id.eq.'+currentUser.id)
          .order('created_at',{ascending:false}).limit(500),
        db.from('gdv_member_blocks').select('blocked_id').eq('blocker_id',currentUser.id)
      ]);
      if(messages.error)throw messages.error;
      if(blocks.error)throw blocks.error;
      dmRecent=messages.data||[];
      dmBlocks=new Set((blocks.data||[]).map(b=>b.blocked_id));
      const unread=dmRecent.filter(m=>m.recipient_id===currentUser.id && !m.read_at).length;
      dmBadge.hidden=unread===0;
      dmBadge.textContent=unread>99?'99+':String(unread);
      dmBadge.setAttribute('aria-label',unread+' mensajes privados sin leer');
      renderPrivateContacts();
      updatePrivateComposer();
    }catch(error){
      if(dmActive)privateNotice('No se pudo actualizar la bandeja privada. '+(error.message||'Reintentá.'));
    }finally{dmInboxBusy=false}
  }
  async function openPrivate(id){
    if(!currentUser || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || id===currentUser.id)return;
    setChatMode(true);
    if(!dmDirectory.length)await refreshPrivateInbox();
    const person=dmDirectory.find(p=>p.id===id);
    if(!person){privateNotice('Este integrante todavía no tiene un perfil habilitado.');return}
    dmPeer=person;
    window.GDV_AEROCHAT_ACTIVE_PEER = person.id;
    dmPeerName.textContent=person.username||'Integrante';
    dmThread.replaceChildren();
    const loading=document.createElement('p');loading.className='empty';loading.textContent='Cargando conversación…';dmThread.append(loading);
    dmInput.value='';
    privateNotice('');
    renderPrivateContacts();
    updatePrivateComposer();
    await refreshPrivateThread();
    await refreshPrivateInbox();
    if (window.matchMedia('(max-width: 550px)').matches && dmActive && dmPeer?.id === id) {
      dmForm.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  }
  async function refreshPrivateThread(){
    if(!currentUser || !dmPeer || document.hidden)return;
    const peer=dmPeer;
    const request=++dmThreadRequest;
    try{
      // Ambas direcciones; la RLS en Supabase impide leer mensajes de terceros.
      const msgs=await db.from('gdv_private_messages')
        .select('id,sender_id,recipient_id,content,created_at,read_at')
        .or('and(sender_id.eq.'+currentUser.id+',recipient_id.eq.'+peer.id+'),and(sender_id.eq.'+peer.id+',recipient_id.eq.'+currentUser.id+')')
        .order('created_at',{ascending:false}).limit(100);
      if(msgs.error)throw msgs.error;
      if(request!==dmThreadRequest||dmPeer?.id!==peer.id)return;
      const previousBottom=dmThread.scrollHeight-dmThread.scrollTop-dmThread.clientHeight<95;
      const fragment=document.createDocumentFragment();
      const all=[...(msgs.data||[])].reverse();
      if(!all.length){
        const empty=document.createElement('p');empty.className='empty';
        empty.textContent='Todavía no hay mensajes privados. Podés iniciar la conversación.';
        fragment.append(empty);
      }
      for(const msg of all){
        const own=msg.sender_id===currentUser.id;
        const article=document.createElement('article');article.className='msg'+(own?' own':'');
        const head=document.createElement('div');head.className='msg-head';
        const who=document.createElement('span');who.className='msg-author';
        who.textContent=own?'Vos':(peer.username||'Integrante');
        const time=document.createElement('time');time.className='msg-time';
        time.dateTime=msg.created_at;time.textContent=timeLabel(msg.created_at);
        head.append(who,time);
        const body=document.createElement('p');body.className='msg-content';body.textContent=msg.content;
        article.append(head,body);
        if(own){
          const receipt=document.createElement('span');receipt.className='msg-time';
          receipt.textContent=msg.read_at?'Leído':'Enviado';
          article.append(receipt);
        }
        fragment.append(article);
      }
      dmThread.replaceChildren(fragment);
      if(previousBottom)dmThread.scrollTop=dmThread.scrollHeight;
      const unread=all.filter(m=>m.recipient_id===currentUser.id && !m.read_at);
      if(unread.length){
        const res=await db.from('gdv_private_messages').update({read_at:new Date().toISOString()})
          .eq('recipient_id',currentUser.id).eq('sender_id',peer.id).is('read_at',null);
        if(!res.error)void refreshPrivateInbox();
      }
    }catch(error){
      if(request===dmThreadRequest)privateNotice('No se pudo cargar la conversación. '+(error.message||'Reintentá.'));
    }
  }
  publicTab.addEventListener('click',()=>setChatMode(false));
  privateTab.addEventListener('click',async()=>{setChatMode(true);await refreshPrivateInbox();});
  dmSearch.addEventListener('input',()=>renderPrivateContacts());
  dmInput.addEventListener('input',updatePrivateComposer);
  dmInput.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();dmForm.requestSubmit()}
  });
  dmForm.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!dmPeer || dmSending || !currentUser)return;
    const target=dmPeer.id,content=dmInput.value.trim();
    if(!content||content.length>1000||dmBlocks.has(target)||!dmConsentAccepted)return;
    dmSending=true;updatePrivateComposer();privateNotice('');
    try{
      const result=await db.from('gdv_private_messages').insert({sender_id:currentUser.id,recipient_id:target,content});
      if(result.error)throw result.error;
      if(dmPeer?.id===target){dmInput.value='';await refreshPrivateThread();dmInput.focus()}
      await refreshPrivateInbox();
    }catch(error){privateNotice('No se pudo enviar el mensaje. '+(error.message||'Reintentá.'))}
    finally{dmSending=false;updatePrivateComposer()}
  });
  dmBlock.addEventListener('click',async()=>{
    if(!dmPeer||!currentUser)return;
    const target=dmPeer.id,isBlocked=dmBlocks.has(target);
    if(!isBlocked&&!confirm('¿Bloquear a este integrante? No podrán enviarse mensajes privados entre ambos.'))return;
    dmBlock.disabled=true;
    try{
      const r=isBlocked?await db.from('gdv_member_blocks').delete().eq('blocker_id',currentUser.id).eq('blocked_id',target)
        :await db.from('gdv_member_blocks').insert({blocker_id:currentUser.id,blocked_id:target});
      if(r.error)throw r.error;
      privateNotice(isBlocked?'Integrante desbloqueado.':'Integrante bloqueado. No recibirá mensajes nuevos.');
      await refreshPrivateInbox();
    }catch(e){privateNotice('No se pudo cambiar el bloqueo. '+(e.message||''))}
    finally{dmBlock.disabled=false}
  });

  function startOnlinePresence() {
    // Private channel: PostgreSQL realtime.messages policies permit authenticated members only.
    onlineChannel = db.channel('gdv-aerochat-online', {
      config: { private: true, presence: { key: currentUser.id } }
    });
    onlineChannel
      .on('presence', { event:'sync' }, () => {
        updateOnlineList().catch(() => onlineUnavailable('No se pudo actualizar la lista.'));
      })
      .subscribe(async (state) => {
        if (state === 'SUBSCRIBED') {
          try {
            const result = await onlineChannel.track({ user_id: currentUser.id });
            if (result !== 'ok') updateOnlineList().catch(() => {});
          } catch {
            updateOnlineList().catch(() => {});
          }
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
          // El listado general sigue funcionando aunque se interrumpa Realtime.
          updateOnlineList().catch(() => {});
        }
      });
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
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      heartbeat().catch(() => {});
      updateOnlineList().catch(() => onlineUnavailable('No se pudo actualizar la lista.'));
      refresh();
      refreshPrivateInbox().catch(()=>{});
      if(dmActive&&dmPeer)refreshPrivateThread().catch(()=>{});
    }
  });
  window.addEventListener('pagehide', () => {
    if (onlineChannel) {
      onlineChannel.untrack().catch(() => {});
      db.removeChannel(onlineChannel);
    }
    if (channel) db.removeChannel(channel);
  });
  setInterval(() => {
    if (!document.hidden) {
      refresh();
      updateOnlineList().catch(() => onlineUnavailable('No se pudo actualizar la lista.'));
      refreshPrivateInbox().catch(()=>{});
      if(dmActive&&dmPeer)refreshPrivateThread().catch(()=>{});
    }
  }, 15000);


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
    await heartbeat();
    await updateOnlineList();
    await refreshPrivateInbox();
    await refreshDmConsent();
    const initialPeer=new URLSearchParams(location.search).get('privado');
    if(initialPeer)await openPrivate(initialPeer);
    startOnlinePresence();
    db.channel('gdv-aerochat-private-inbox')
      .on('postgres_changes',{event:'*',schema:'public',table:'gdv_private_messages'},()=>{
        refreshPrivateInbox().catch(()=>{});
        if(dmActive&&dmPeer)refreshPrivateThread().catch(()=>{});
      }).subscribe();
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
