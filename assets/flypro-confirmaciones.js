/* FlyPro · sonido de confirmación. Silenciado de fábrica, por usuario en este dispositivo. */
(function () {
  "use strict";
  if (window.FlyProSound) return;
  const script = document.currentScript;
  const audioUrl = new URL("./flypro-confirmacion-cabina.ogg", script ? script.src : document.baseURI).href;
  let enabled = false, lastPlayed = 0, audio = null, key = "flypro.sound.confirm.v1.guest";
  const MIN_INTERVAL_MS = 1000;

  function createAudio() {
    if (audio) return audio;
    audio = new Audio(audioUrl);
    audio.preload = "none";
    audio.volume = 0.22;
    return audio;
  }
  function confirmSuccess() {
    if (!enabled || document.hidden) return false;
    const t = Date.now();
    if (t - lastPlayed < MIN_INTERVAL_MS) return false;
    lastPlayed = t;
    try {
      const player = createAudio();
      player.pause();
      player.currentTime = 0;
      const playPromise = player.play();
      if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => {});
    } catch (_) { /* La operación siempre tiene prioridad frente al sonido. */ }
    return true;
  }
  const api = {
    confirm: confirmSuccess,
    isEnabled: () => enabled,
    setEnabled: value => {
      enabled = Boolean(value);
      try { window.localStorage.setItem(key, enabled ? "1" : "0"); } catch (_) {}
      updateToggle();
    }
  };
  window.FlyProSound = api;

  const label = () => enabled ? "Sonido activado" : "Sonido apagado";
  let button = null;
  function updateToggle() {
    if (!button) return;
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
    button.setAttribute("aria-label", enabled ? "Silenciar sonidos de confirmación" : "Activar sonidos de confirmación");
    button.title = "FlyPro · " + label() + " (confirmaciones de operaciones)";
    button.classList.toggle("is-enabled", enabled);
    const span = button.querySelector(".flypro-sound-label");
    if (span) span.textContent = enabled ? "Sonido: sí" : "Sonido: no";
    const off = button.querySelector(".flypro-sound-off");
    if (off) off.hidden = enabled;
  }
  function mountToggle() {
    if (button || !document.body) return;
    const header = document.querySelector("body > header, header.maint-header, header");
    if (!header) return;
    const host = header.querySelector(".maint-links, .portal-head-links, nav") || header;
    const style = document.createElement("style");
    style.textContent = [
      ".flypro-sound-toggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:34px;padding:6px 9px;margin-left:9px;border:1px solid rgba(214,177,109,.45);border-radius:8px;background:rgba(18,39,55,.75);color:#dfd5bb;font:600 11px/1.25 system-ui,sans-serif;cursor:pointer;flex:0 0 auto;white-space:nowrap;box-shadow:none;transition:border-color .18s,color .18s}",
      ".flypro-sound-toggle:hover,.flypro-sound-toggle:focus-visible{border-color:#f2cb83;color:#fff;background:rgba(31,55,72,.95)}",
      ".flypro-sound-toggle.is-enabled{color:#f0cc89;border-color:#cba75d}",
      ".flypro-sound-toggle svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}",
      ".flypro-sound-toggle .flypro-sound-off[hidden]{display:none!important}"
    ].join("\n");
    document.head.appendChild(style);
    button = document.createElement("button");
    button.type = "button";
    button.id = "flyproSoundToggle";
    button.className = "flypro-sound-toggle";
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"></path><path d="M15.5 8.5c1.6 1.6 1.6 5.4 0 7"></path><path d="M18.5 5.5c3.3 3.3 3.3 9.7 0 13"></path><path class="flypro-sound-off" d="M3 3l18 18"></path></svg><span class="flypro-sound-label">Sonido: no</span>';
    button.addEventListener("click", () => api.setEnabled(!enabled));
    host.appendChild(button);
    updateToggle();
  }
  async function init() {
    try {
      const auth = window.GDV_AUTH;
      if (auth && auth.ready) await auth.ready;
      if (auth && auth.client && auth.client.auth) {
        const response = await auth.client.auth.getUser();
        if (response.data && response.data.user && response.data.user.id)
          key = "flypro.sound.confirm.v1." + response.data.user.id;
      }
    } catch (_) {}
    try { enabled = window.localStorage.getItem(key) === "1"; } catch (_) { enabled = false; }
    mountToggle();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
