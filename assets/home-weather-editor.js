/* Editor del carrusel meteorológico de portada (solo administración).
   Controla posición vertical y ancho/alto de cada tarjeta en escritorio.
   El diseño del celular no se modifica. */
(() => {
  'use strict';
  const root = document.getElementById('gdv-meteo-ciudades');
  const db = window.GDV_AUTH?.client;
  if (!root || !db) return;

  const wanted = new URLSearchParams(location.search).get('editar-meteo') === '1';
  const desktop = () => matchMedia('(min-width:701px)').matches;
  const DEFAULT_WIDTH = 265, DEFAULT_HEIGHT = 76;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, Math.round(Number(n) || min)));
  const clean = row => ({
    lift: clamp(row?.lift_px ?? 0, 0, 280),
    width: row?.card_width_px == null ? null : clamp(row.card_width_px, 195, 440),
    height: row?.card_height_px == null ? null : clamp(row.card_height_px, 60, 150)
  });
  const equal = (a, b) => a.lift === b.lift && a.width === b.width && a.height === b.height;
  let saved = clean(null), draft = clean(null);
  let loading = true, busy = false, editing = false, panel = null;

  function status(message, error = false) {
    const node = panel?.querySelector('#gdvWeatherEditStatus');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('gdv-wx-edit-error', error);
  }
  function apply() {
    const onDesktop = desktop();
    root.style.setProperty('--gdv-weather-lift', (onDesktop ? draft.lift : 0) + 'px');
    if (onDesktop && draft.width != null)
      root.style.setProperty('--gdv-weather-card-width', draft.width + 'px');
    else root.style.removeProperty('--gdv-weather-card-width');

    const customHeight = onDesktop && draft.height != null;
    root.classList.toggle('gdv-wx-height-custom', customHeight);
    if (customHeight) {
      root.style.setProperty('--gdv-weather-card-height', draft.height + 'px');
      root.style.setProperty('--gdv-weather-card-factor',
        String(Math.max(0.78, Math.min(1.25, draft.height / DEFAULT_HEIGHT))));
    } else {
      root.style.removeProperty('--gdv-weather-card-height');
      root.style.removeProperty('--gdv-weather-card-factor');
    }
  }
  function repaint(message) {
    apply();
    if (!panel) return;
    panel.querySelector('#gdvWeatherLift').value = String(draft.lift);
    panel.querySelector('#gdvWeatherValue').textContent = draft.lift + ' px';
    panel.querySelector('#gdvWeatherWidth').value = String(draft.width ?? DEFAULT_WIDTH);
    panel.querySelector('#gdvWeatherWidthValue').textContent =
      draft.width == null ? 'Original' : draft.width + ' px';
    panel.querySelector('#gdvWeatherHeight').value = String(draft.height ?? DEFAULT_HEIGHT);
    panel.querySelector('#gdvWeatherHeightValue').textContent =
      draft.height == null ? 'Original' : draft.height + ' px';
    panel.querySelector('#gdvWeatherSave').disabled = busy || equal(draft, saved);
    panel.querySelector('#gdvWeatherReset').disabled =
      busy || (equal(saved, clean(null)) && equal(draft, clean(null)));
    panel.querySelector('#gdvWeatherSizeOriginal').disabled =
      busy || (draft.width == null && draft.height == null);
    panel.querySelectorAll('button[data-step], input[type=range]').forEach(el => { el.disabled = busy; });
    status(message || (equal(draft, saved)
      ? 'Ajustá la ubicación y el tamaño de las tarjetas.'
      : 'Vista previa. Pulsá Guardar para aplicar los cambios a todos.'));
  }
  function stage(field, value) {
    if (!editing || busy) return;
    if (field === 'lift') draft.lift = clamp(value, 0, 280);
    else if (field === 'width') draft.width = clamp(value, 195, 440);
    else if (field === 'height') draft.height = clamp(value, 60, 150);
    repaint();
  }
  function clearQuery() {
    const url = new URL(location.href);
    url.searchParams.delete('editar-meteo');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  function close() {
    if (busy) return;
    if (!equal(draft, saved) && !confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
    editing = false;
    draft = { ...saved };
    panel?.remove();
    panel = null;
    apply();
    clearQuery();
  }
  async function save() {
    if (!editing || busy || equal(draft, saved) || !window.gdvLegacyAdmin) return;
    busy = true;
    repaint('Guardando posición y tamaño…');
    let message = '', failed = false;
    try {
      const { data, error } = await db.from('gdv_home_weather_position')
        .upsert({
          id: 1,
          lift_px: draft.lift,
          card_width_px: draft.width,
          card_height_px: draft.height,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
        .select('lift_px,card_width_px,card_height_px').maybeSingle();
      if (error || !data) throw Error(error?.message || 'No se confirmó el guardado.');
      saved = clean(data);
      draft = { ...saved };
      message = 'Cambios guardados para todos los visitantes en computadoras.';
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
    if (!confirm('¿Restaurar la posición y el tamaño original del carrusel para todos?')) return;
    busy = true;
    repaint('Restaurando ajustes originales…');
    let message = '', failed = false;
    try {
      const { error } = await db.from('gdv_home_weather_position').delete().eq('id', 1);
      if (error) throw error;
      saved = clean(null);
      draft = { ...saved };
      message = 'Se restauró la posición y el tamaño original.';
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
    const params = new URLSearchParams(location.search);
    if (params.has('editar-tarjetas') || params.has('editar-marca') || params.has('editar-video')) return;
    editing = true;
    panel = document.createElement('section');
    panel.id = 'gdvWeatherEditor';
    panel.setAttribute('aria-label', 'Posición y tamaño del carrusel meteorológico');
    panel.innerHTML =
      '<strong>CARRUSEL METEOROLÓGICO</strong>' +
      '<span>Ubicación y tamaño de todas las tarjetas en PC. El celular no cambia.</span>' +
      '<div class="gdv-wx-editor-controls">' +
        '<button type="button" data-step="12">↑ Subir</button>' +
        '<button type="button" data-step="-12">↓ Bajar</button>' +
        '<label for="gdvWeatherLift">Posición vertical</label>' +
        '<input type="range" id="gdvWeatherLift" min="0" max="280" step="4" aria-label="Elevar carrusel en píxeles">' +
        '<output id="gdvWeatherValue" for="gdvWeatherLift">0 px</output>' +
      '</div>' +
      '<div class="gdv-wx-editor-controls">' +
        '<label for="gdvWeatherWidth">Ancho de tarjetas</label>' +
        '<input type="range" id="gdvWeatherWidth" min="195" max="440" step="5">' +
        '<output id="gdvWeatherWidthValue" for="gdvWeatherWidth">Original</output>' +
      '</div>' +
      '<div class="gdv-wx-editor-controls">' +
        '<label for="gdvWeatherHeight">Alto de tarjetas</label>' +
        '<input type="range" id="gdvWeatherHeight" min="60" max="150" step="2">' +
        '<output id="gdvWeatherHeightValue" for="gdvWeatherHeight">Original</output>' +
        '<button type="button" id="gdvWeatherSizeOriginal">Tamaño original</button>' +
      '</div>' +
      '<div class="gdv-wx-editor-actions">' +
        '<button type="button" id="gdvWeatherSave">Guardar</button>' +
        '<button type="button" id="gdvWeatherReset">Restaurar todo</button>' +
        '<button type="button" id="gdvWeatherClose">Terminar</button>' +
      '</div>' +
      '<p id="gdvWeatherEditStatus" role="status" aria-live="polite"></p>';
    document.body.append(panel);
    panel.querySelector('#gdvWeatherLift').addEventListener('input', e => stage('lift', e.target.value));
    panel.querySelector('#gdvWeatherWidth').addEventListener('input', e => stage('width', e.target.value));
    panel.querySelector('#gdvWeatherHeight').addEventListener('input', e => stage('height', e.target.value));
    panel.querySelectorAll('button[data-step]').forEach(button =>
      button.addEventListener('click', () => stage('lift', draft.lift + Number(button.dataset.step))));
    panel.querySelector('#gdvWeatherSizeOriginal').addEventListener('click', () => {
      if (busy) return;
      draft.width = null;
      draft.height = null;
      repaint();
    });
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
      editing = false;
      draft = { ...saved };
      panel?.remove();
      panel = null;
      clearQuery();
    }
    apply();
    openEditor();
  });
  async function load() {
    try {
      const { data, error } = await db.from('gdv_home_weather_position')
        .select('lift_px,card_width_px,card_height_px').eq('id', 1).maybeSingle();
      if (error) throw error;
      saved = clean(data);
    } catch (error) {
      console.warn('No se pudieron leer los ajustes del carrusel meteorológico.', error);
    } finally {
      loading = false;
      draft = { ...saved };
      apply();
      openEditor();
    }
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();
