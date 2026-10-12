'use strict';
/* Habilitación voluntaria de avisos push por dispositivo; no incluye texto de chats. */
(() => {
  const auth = window.GDV_AUTH;
  const status = document.getElementById('push-status');
  const button = document.getElementById('push-toggle');
  const privateOption = document.getElementById('push-private');
  const generalOption = document.getElementById('push-general');
  if (!auth || !status || !button || !privateOption || !generalOption) return;

  let subscription = null;
  let busy = false;
  const supported = () => 'serviceWorker' in navigator &&
    'PushManager' in window && 'Notification' in window &&
    window.isSecureContext;
  const isIPhone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const standalone = () => window.matchMedia?.('(display-mode: standalone)')?.matches ||
    navigator.standalone === true;

  function say(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('push-error', isError);
  }
  function sync() {
    button.disabled = busy;
    button.textContent = subscription ? 'Desactivar en este dispositivo' : 'Activar notificaciones';
    privateOption.disabled = !subscription || busy;
    generalOption.disabled = !subscription || busy;
  }
  async function invoke(action, extra = {}) {
    const { data, error } = await auth.client.functions.invoke('gdv-aerochat-push', {
      body: { action, ...extra }
    });
    if (error) throw new Error('El servidor de notificaciones no respondió.');
    if (data?.error) throw new Error(data.error);
    return data;
  }
  async function registration() {
    return navigator.serviceWorker.register('/aerochat-push-sw.js', { scope: '/' });
  }
  function bytesFromBase64(value) {
    const raw = atob(value.replace(/-/g,'+').replace(/_/g,'/') +
      '='.repeat((4 - value.length % 4) % 4));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }
  async function updateOptions() {
    if (!subscription || busy) return;
    busy = true; sync();
    try {
      await invoke('subscribe', {
        subscription: subscription.toJSON(),
        private_enabled: privateOption.checked,
        general_enabled: generalOption.checked
      });
      say('Preferencias guardadas para este dispositivo.');
    } catch(error) { say(error.message || 'No se pudieron guardar las preferencias.', true); }
    finally { busy = false; sync(); }
  }
  async function toggle() {
    if (busy || !supported()) return;
    // El permiso debe solicitarse directamente desde el clic del integrante.
    const permission = !subscription && Notification.permission === 'default'
      ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    busy = true; sync();
    try {
      if (subscription) {
        const old = subscription;
        await invoke('unsubscribe', { endpoint: old.endpoint });
        await old.unsubscribe();
        subscription = null;
        say('Notificaciones desactivadas en este dispositivo.');
      } else {
        if (isIPhone && !standalone())
          throw new Error('En iPhone, primero agregá Gente de Vuelo a la pantalla de inicio y abrila desde ese ícono.');
        if (await permission !== 'granted')
          throw new Error('Tenés que permitir las notificaciones en el navegador.');
        const user = await auth.validate();
        if (!user || auth.needsOnboarding()) throw new Error('Completá tu registro para activar avisos.');
        const key = await invoke('key');
        if (!key?.publicKey) throw new Error('No se obtuvo la clave pública de notificaciones.');
        const reg = await registration();
        subscription = await reg.pushManager.getSubscription();
        if (!subscription) {
          subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true, applicationServerKey: bytesFromBase64(key.publicKey)
          });
        }
        try {
          await invoke('subscribe', {
            subscription: subscription.toJSON(),
            private_enabled: privateOption.checked,
            general_enabled: generalOption.checked
          });
        } catch(e) {
          await subscription.unsubscribe();
          subscription = null;
          throw e;
        }
        say('Avisos activados. Los recibirás cuando no estés en la página.');
      }
    } catch(error) { say(error.message || 'No fue posible cambiar las notificaciones.', true); }
    finally { busy = false; sync(); }
  }
  button.addEventListener('click', () => { void toggle(); });
  privateOption.addEventListener('change', () => { void updateOptions(); });
  generalOption.addEventListener('change', () => { void updateOptions(); });
  (async () => {
    if (!supported()) {
      button.disabled = true;
      privateOption.disabled = true;
      generalOption.disabled = true;
      say('Este navegador o modo no admite notificaciones push.' +
        (isIPhone ? ' En iPhone se requiere agregar el sitio a la pantalla de inicio.' : ''), true);
      return;
    }
    try {
      await auth.ready;
      const reg = await navigator.serviceWorker.getRegistration('/aerochat-push-sw.js');
      if (reg?.active?.scriptURL.includes('/aerochat-push-sw.js')) {
        subscription = await reg.pushManager.getSubscription();
      }
      if (subscription) {
        const preferences = await invoke('settings', { endpoint: subscription.endpoint });
        privateOption.checked = preferences.private_enabled !== false;
        generalOption.checked = preferences.general_enabled === true;
        say('Avisos activados en este dispositivo.');
      } else {
        say('Elegí activar para recibir avisos incluso al cerrar la página.');
      }
    } catch { say('No se pudo consultar el permiso de notificaciones.', true); }
    sync();
  })();
})();
