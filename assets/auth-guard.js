'use strict';
(() => {
  const base = new URL('../', document.currentScript.src);
  const client = supabase.createClient(GDV_CONFIG.url, GDV_CONFIG.key);
  const loginURL = new URL('comunidad.html#ingresar', base);
  const onboardingURL = new URL('comunidad.html#completar-perfil', base);
  const homeURL = new URL('index.html', base).href;
  const recoveryURL = new URL('index.html?gdv_recovery=1', base).href;
  const recovery =
    new URLSearchParams(location.search).get('gdv_recovery') === '1' ||
    new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
  let verifiedUser = null;
  let pendingValidation = null;
  let presenceBusy = false;
  let lastPresence = 0;
  let onboardingRequired = false;
  // A completed Google sign-in is not the same as a completed community registration.
  async function refreshOnboarding(account = verifiedUser) {
    if (!account) { onboardingRequired = false; return false; }
    const result = await client.from('profiles').select('onboarding_completed').eq('id', account.id).maybeSingle();
    if (result.error) throw result.error;
    // Fail closed if the profile has not been generated yet.
    onboardingRequired = !result.data || result.data.onboarding_completed !== true;
    return onboardingRequired;
  }
  function permittedDuringOnboarding() {
    return location.pathname === loginURL.pathname &&
      ['#completar-perfil', '#normativa'].includes(location.hash);
  }
  function redirectOnboarding() {
    if (!onboardingRequired || recovery || permittedDuringOnboarding()) return false;
    document.documentElement.classList.add('auth-pending');
    location.replace(onboardingURL.href);
    return true;
  }
  // A single heartbeat shared by Home, Foro, Galería and AeroChat.
  // PostgreSQL sets its own authoritative last_seen timestamp.
  async function heartbeat() {
    if (!verifiedUser || document.hidden || presenceBusy || Date.now()-lastPresence<25000) return;
    presenceBusy = true;
    try {
      const {error} = await client.from('gdv_member_presence').upsert({
        user_id: verifiedUser.id,
        last_seen: new Date().toISOString()
      });
      if (!error) lastPresence = Date.now();
    } finally {
      presenceBusy = false;
    }
  }
  function publicRoute() {
    const onCommunity = location.pathname === loginURL.pathname;
    const onHome = location.pathname === base.pathname || location.pathname === new URL('index.html', base).pathname;
    if (onHome) return true;
    if (!onCommunity) return false;
    const hash = location.hash || '#foro';
    if (['#ingresar', '#registro', '#recuperar', '#normativa', '#quienes-somos', '#foro', '#tematicas', '#multimedia', '#galeria', '#integrantes'].includes(hash)) return true;
    return ['#tematica/', '#tema/', '#hangar/'].some(prefix => hash.startsWith(prefix));
  }
  function rememberDestination() {
    if (!publicRoute() && !recovery) {
      try { sessionStorage.setItem('gdv-return-to', location.href); } catch {}
    }
  }
  function goLogin() {
    rememberDestination();
    if (!publicRoute()) location.replace(loginURL.href);
  }
  async function validate() {
    if (pendingValidation) return pendingValidation;
    pendingValidation = (async () => {
      const { data, error } = await client.auth.getSession();
      verifiedUser = null;
      if (error || !data?.session) return null;
      // A cached JWT can outlive a deleted account: verify it with Auth.
      const result = await client.auth.getUser();
      if (result.error || !result.data?.user) {
        if (!result.error || [400, 401, 403, 404].includes(result.error.status)) {
          await client.auth.signOut({ scope: 'local' });
        }
        return null;
      }
      verifiedUser = result.data.user;
      return verifiedUser;
    })();
    try { return await pendingValidation; }
    finally { pendingValidation = null; }
  }
  async function requireRoute() {
    await ready;
    if (onboardingRequired && !recovery) {
      if (!permittedDuringOnboarding()) { redirectOnboarding(); return false; }
      return true;
    }
    if (publicRoute() || recovery) return true;
    if (await validate()) return true;
    document.documentElement.classList.add('auth-pending');
    goLogin();
    return false;
  }
  async function afterLogin() {
    if (!await validate()) return;
    if (await refreshOnboarding()) {
      location.replace(onboardingURL.href);
      return;
    }
    let destination = new URL('comunidad.html#foro', base);
    try {
      const saved = sessionStorage.getItem('gdv-return-to');
      sessionStorage.removeItem('gdv-return-to');
      if (saved) {
        const candidate = new URL(saved);
        if (candidate.origin === base.origin && candidate.pathname.startsWith(base.pathname)) destination = candidate;
      }
    } catch {}
    location.replace(destination.href);
  }
  const ready = validate().catch(() => null).then(async user => {
    if (user && !recovery) {
      try { await refreshOnboarding(user); }
      catch { onboardingRequired = true; } // Never grant access on an uncertain registration status.
      if (redirectOnboarding()) return user;
    }
    if (!user && !publicRoute() && !recovery) goLogin();
    else document.documentElement.classList.remove('auth-pending');
    return user;
  });
  window.GDV_AUTH = { client, ready, validate, requireRoute, afterLogin, refreshOnboarding,
    needsOnboarding: () => onboardingRequired, heartbeat, homeURL, recoveryURL, recovery };
  ready.then(() => heartbeat()).catch(() => {});
  setInterval(() => heartbeat().catch(() => {}), 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) heartbeat().catch(() => {});
  });
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') {
      verifiedUser = null;
      onboardingRequired = false;
      lastPresence = 0;
      if (!publicRoute()) {
        document.documentElement.classList.add('auth-pending');
        goLogin();
      }
    }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) requireRoute(); });
  window.addEventListener('hashchange', () => requireRoute());
})();
