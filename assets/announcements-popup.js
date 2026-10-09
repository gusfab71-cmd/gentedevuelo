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


  // Presentación institucional única por integrante y navegador.
  // La visita no representa consentimiento para recibir correos.
  const institutionalSeenFallback = new Set();
  const institutionalKey = uid => 'gdv-presentacion-institucional-20261009:' + uid;
  function institutionalWasSeen(uid) {
    if (institutionalSeenFallback.has(uid)) return true;
    try { return localStorage.getItem(institutionalKey(uid)) === '1'; }
    catch { return false; }
  }
  function rememberInstitutional(uid) {
    institutionalSeenFallback.add(uid);
    try { localStorage.setItem(institutionalKey(uid), '1'); } catch {}
  }
  function renderInstitutional(uid) {
    if (popup.open || document.querySelector('dialog[open]')) return false;
    popup.classList.add('gdv-modo-institucional');
    popup.dataset.institutionalUid = uid;
    popup.innerHTML = `
      <section class="gdv-comunicado-contenido gdv-presentacion-institucional">
        <button type="button" class="gdv-comunicado-cerrar" aria-label="Cerrar presentación institucional">×</button>
        <div class="gdv-institucional-cabecera">
          <img class="gdv-institucional-logo" src="logo circular recortado gente de vuelo.png" alt="Logo de Gente de Vuelo" width="88" height="88">
          <span class="gdv-institucional-sello">NUESTRA COMUNIDAD</span>
          <h2 id="gdv-comunicado-titulo">Una comunidad construida con compromiso</h2>
          <p>Bienvenido a <strong>Gente de Vuelo</strong>, un proyecto sin fines de lucro que reúne a quienes compartimos la pasión por la aviación.</p>
        </div>
        <div class="gdv-institucional-pilares" aria-label="Nuestros compromisos">
          <div><span aria-hidden="true">01</span><p><strong>Respeto y seguridad.</strong> Moderamos las publicaciones según nuestra Normativa de Comunidad.</p></div>
          <div><span aria-hidden="true">02</span><p><strong>Aprender y compartir.</strong> Foro, Mi Hangar, experiencias, eventos y recursos aeronáuticos.</p></div>
          <div><span aria-hidden="true">03</span><p><strong>Información voluntaria.</strong> Vos elegís si querés recibir nuestras novedades por correo.</p></div>
        </div>
        <p class="gdv-institucional-cta-texto">Nos gustaría mantenerte al tanto de las mejoras, actividades y novedades de Gente de Vuelo.</p>
        <div class="gdv-comunicado-acciones">
          <button type="button" id="gdv-institucional-suscribirse" class="gdv-comunicado-principal">Quiero recibir novedades por correo</button>
          <button type="button" id="gdv-institucional-omitir" class="gdv-comunicado-secundario">Ahora no, gracias</button>
        </div>
        <p class="gdv-comunicado-ayuda">La suscripción es gratuita y opcional. Este aviso no activa el envío de correos. Podés cambiar tu elección cuando quieras desde Mi cuenta.</p>
      </section>`;
    const end = () => {
      rememberInstitutional(uid);
      if (popup.open) popup.close();
    };
    popup.querySelector('.gdv-comunicado-cerrar').addEventListener('click', end);
    popup.querySelector('#gdv-institucional-omitir').addEventListener('click', end);
    popup.querySelector('#gdv-institucional-suscribirse').addEventListener('click', () => {
      end();
      location.href = new URL('comunidad.html#preferencias-correo', location.href).href;
    });
    try { popup.showModal(); } catch {
      popup.classList.remove('gdv-modo-institucional');
      delete popup.dataset.institutionalUid;
      return false;
    }
    popup.querySelector('#gdv-institucional-suscribirse')?.focus();
    return true;
  }
  popup.addEventListener('close', () => {
    const uid = popup.dataset.institutionalUid;
    if (uid) rememberInstitutional(uid); // Escape también cuenta como leído.
    delete popup.dataset.institutionalUid;
    popup.classList.remove('gdv-modo-institucional');
  });

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
    popup.classList.remove('gdv-modo-institucional');
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
    if (['#notificaciones', '#preferencias-correo'].includes(location.hash)) return;
    if (document.querySelector('dialog[open]')) return;
    loading = true;
    lastUserId = user.id;
    try {
      // Una única presentación antes de avisos habituales: no obliga a suscribirse.
      if (!institutionalWasSeen(user.id) && renderInstitutional(user.id)) return;
      const result = await db.from('gdv_notifications')
        .select('id,message,created_at')
        .eq('user_id', user.id)
        .eq('read', false)
        .like('message', prefix + '%')
        .order('created_at', { ascending: false })
        .limit(1);
      if (result.error || !result.data?.length) return;
      const item = result.data[0];
      // No repetir el comunicado original de suscripción tras esta presentación.
      if (institutionalWasSeen(user.id) && item.message.startsWith(prefix + 'Mantente informado sobre Gente de Vuelo')) return;
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
