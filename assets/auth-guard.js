'use strict';
(() => {
  const base = new URL('../', document.currentScript.src);
  const client = supabase.createClient(GDV_CONFIG.url, GDV_CONFIG.key);
  const loginURL = new URL('comunidad.html#ingresar', base);
  const recoveryURL = new URL('index.html', base).href;
  const recovery = new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
  let verifiedUser = null;
  let pendingValidation = null;
  function publicRoute() {
    const onCommunity = location.pathname === loginURL.pathname;
    const onHome = location.pathname === base.pathname || location.pathname === new URL('index.html', base).pathname;
    return onHome || (onCommunity &&
      ['#ingresar', '#registro', '#recuperar', '#normativa'].includes(location.hash));
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
    if (publicRoute() || recovery) return true;
    if (await validate()) return true;
    document.documentElement.classList.add('auth-pending');
    goLogin();
    return false;
  }
  async function afterLogin() {
    if (!await validate()) return;
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
  const ready = validate().catch(() => null).then(user => {
    if (!user && !publicRoute() && !recovery) goLogin();
    else document.documentElement.classList.remove('auth-pending');
    return user;
  });
  window.GDV_AUTH = { client, ready, validate, requireRoute, afterLogin, recoveryURL, recovery };
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') {
      verifiedUser = null;
      if (!publicRoute()) {
        document.documentElement.classList.add('auth-pending');
        goLogin();
      }
    }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) requireRoute(); });
  window.addEventListener('hashchange', () => requireRoute());
})();
