/* Editor del carrusel meteorológico de portada (solo administración).
   Cambia exclusivamente la elevación en escritorio, sin tocar el estilo móvil. */
(() => {
  'use strict';
  const root = document.getElementById('gdv-meteo-ciudades');
  const db = window.GDV_AUTH?.client;
  if (!root || !db) return;

  const wanted = new URLSearchParams(location.search).get('editar-meteo') === '1';
  const desktop = () => matchMedia('(min-width:701px)').matches;
  const clamp = n => Math.max(0, Math.min(280, Math.round(Number(n) || 0)));
  let saved = 0, draft = 0, loading = true, busy = false, editing = false, panel = null;
  const status = (message, error = false) => {
    const node = panel?.querySelector('#gdvWeatherEditStatus');
    if (node) {
      node.textContent = message;
      node.classList.toggle('gdv-wx-edit-error', error);
    }
  };

  function apply() {
    root.style.setProperty('--gdv-weather-lift', (desktop() ? draft : 0) + 'px');
  }
  function repaint(message) {
    apply();
    if (!panel) return;
    const range = panel.querySelector('#gdvWeatherLift');
    range.value = String(draft);
    panel.querySelector('#gdvWeatherValue').textContent = draft + ' px';
    panel.querySelector('#gdvWeatherSave').disabled = busy || draft === saved;
    panel.querySelector('#gdvWeatherReset').disabled = busy || (saved === 0 && draft === 0);
    panel.querySelectorAll('button[data-step]').forEach(button => { button.disabled = busy; });
    status(message || (draft !== saved
      ? 'Vista previa: guardá para aplicar la posición a todos.'
      : 'Usá los botones o la barra para cambiar la altura.'));
  }
  function stage(value) {
    if (!editing || busy) return;
    draft = clamp(value);
    repaint();
  }
  function clearQuery() {
    const url = new URL(location.href);
    url.searchParams.delete('editar-meteo');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  function close() {
    if (busy) return;
    if (draft !== saved && !confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
    editing = false;
    draft = saved;
    panel?.remove();
    panel = null;
    apply();
    clearQuery();
  }
  async function save() {
    if (!editing || busy || draft === saved || !window.gdvLegacyAdmin) return;
    busy = true;
    repaint('Guardando ubicación del carrusel…');
    let message = '', failed = false;
    try {
      const { data, error } = await db.from('gdv_home_weather_position')
        .upsert({ id: 1, lift_px: draft, updated_at: new Date().toISOString() }, { onConflict: 'id' })
        .select('lift_px').maybeSingle();
      if (error || !data) throw Error(error?.message || 'No se confirmó el guardado.');
      saved = clamp(data.lift_px);
      draft = saved;
      message = 'Posición guardada. El cambio es visible para todos en computadoras.';
    } catch (error) {
      message = 'No se pudo guardar: ' + (error.message || 'Error de conexión.');
      failed = true;
    } finally {
      busy = false;
      repaint(message);
      if (failed) status(message, true);
    }
  }
  async function reset() {
    if (!editing || busy || !window.gdvLegacyAdmin) return;
    if (!confirm('¿Restaurar la altura original del carrusel para todos?')) return;
    busy = true;
    repaint('Restaurando posición…');
    let message = '', failed = false;
    try {
      const { error } = await db.from('gdv_home_weather_position').delete().eq('id', 1);
      if (error) throw error;
      saved = 0;
      draft = 0;
      message = 'Se restauró la ubicación original del carrusel.';
    } catch (error) {
      message = 'No se pudo restaurar: ' + (error.message || 'Error de conexión.');
      failed = true;
    } finally {
      busy = false;
      repaint(message);
      if (failed) status(message, true);
    }
  }
  function openEditor() {
    if (!wanted || loading || editing || !window.gdvLegacyAdmin || !desktop()) return;
    // Los demás editores de portada usan controles exclusivos para no interferir entre sí.
    const params = new URLSearchParams(location.search);
    if (params.has('editar-tarjetas') || params.has('editar-marca') || params.has('editar-video')) return;
    editing = true;
    panel = document.createElement('section');
    panel.id = 'gdvWeatherEditor';
    panel.setAttribute('aria-label', 'Ajustar altura del carrusel meteorológico');
    panel.innerHTML =
      '<strong>CARRUSEL METEOROLÓGICO</strong>' +
      '<span>Ubicación de la franja en computadoras (los celulares no cambian).</span>' +
      '<div class="gdv-wx-editor-controls">' +
        '<button type="button" data-step="12">↑ Subir</button>' +
        '<button type="button" data-step="-12">↓ Bajar</button>' +
        '<label for="gdvWeatherLift">Altura</label>' +
        '<input type="range" id="gdvWeatherLift" min="0" max="280" step="4" aria-label="Elevar carrusel en píxeles">' +
        '<output id="gdvWeatherValue" for="gdvWeatherLift">0 px</output>' +
      '</div>' +
      '<div class="gdv-wx-editor-actions">' +
        '<button type="button" id="gdvWeatherSave">Guardar</button>' +
        '<button type="button" id="gdvWeatherReset">Restaurar original</button>' +
        '<button type="button" id="gdvWeatherClose">Terminar</button>' +
      '</div>' +
      '<p id="gdvWeatherEditStatus" role="status" aria-live="polite"></p>';
    document.body.append(panel);
    panel.querySelector('#gdvWeatherLift').addEventListener('input', event => stage(event.target.value));
    panel.querySelectorAll('button[data-step]').forEach(button => button.addEventListener('click', () => {
      stage(draft + Number(button.dataset.step));
    }));
    panel.querySelector('#gdvWeatherSave').addEventListener('click', save);
    panel.querySelector('#gdvWeatherReset').addEventListener('click', reset);
    panel.querySelector('#gdvWeatherClose').addEventListener('click', close);
    repaint();
  }

  window.addEventListener('gdv-admin-ready', event => {
    if (event.detail?.isAdmin) openEditor();
  });
  window.addEventListener('resize', () => {
    if (editing && !desktop()) {
      // Cerrar al pasar a móvil sin guardar una previsualización sin querer.
      editing = false; draft = saved; panel?.remove(); panel = null; clearQuery();
    }
    apply();
    openEditor();
  });
  async function load() {
    try {
      const { data, error } = await db.from('gdv_home_weather_position')
        .select('lift_px').eq('id', 1).maybeSingle();
      if (error) throw error;
      if (data) saved = clamp(data.lift_px);
    } catch (error) {
      console.warn('No se pudo leer la ubicación del carrusel meteorológico.', error);
    } finally {
      loading = false; draft = saved; apply(); openEditor();
    }
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();
