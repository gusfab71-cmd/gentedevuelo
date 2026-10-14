/* Editor de posicion de la fotografia del avion en la portada.
   Disponible solo para administradores, y solo en computadoras. */
(() => {
  'use strict';
  const db = window.GDV_AUTH?.client;
  const cover = document.querySelector('.portada-completa');
  if (!db || !cover) return;
  const wanted = new URLSearchParams(location.search).get('editar-avion') === '1';
  const desktop = () => matchMedia('(min-width:701px)').matches;
  const original = { x: 50, y: 65 };
  const clamp = n => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const normalize = data => ({
    x: clamp(data.x),
    y: clamp(data.y)
  });
  const same = (a, b) => a.x === b.x && a.y === b.y;
  let saved = { ...original };
  let draft = { ...original };
  let panel = null;
  let loaded = false, editing = false, saving = false;

  function apply() {
    const value = desktop() ? draft : original;
    cover.style.setProperty('--gdv-aircraft-bg-x', value.x + '%');
    cover.style.setProperty('--gdv-aircraft-bg-y', value.y + '%');
  }
  function render(message = '', error = false) {
    apply();
    if (!panel) return;
    for (const axis of ['x', 'y']) {
      const range = panel.querySelector('#gdvAircraft' + axis.toUpperCase());
      const output = panel.querySelector('#gdvAircraft' + axis.toUpperCase() + 'Value');
      range.value = String(draft[axis]);
      output.textContent = draft[axis] + '%';
      range.disabled = saving;
    }
    panel.querySelector('#gdvAircraftSave').disabled = saving || same(draft, saved);
    panel.querySelector('#gdvAircraftReset').disabled = saving || same(draft, original) && same(saved, original);
    panel.querySelectorAll('button[data-axis]').forEach(b => { b.disabled = saving; });
    const status = panel.querySelector('#gdvAircraftStatus');
    status.textContent = message || (same(draft, saved)
      ? 'Ajustá las barras o las flechas para mover la fotografía de fondo.'
      : 'Vista previa: guardá para que todos vean esta ubicación.');
    status.classList.toggle('gdv-aircraft-error', error);
  }
  function change(axis, value) {
    if (!editing || saving) return;
    draft = normalize({ ...draft, [axis]: value });
    render();
  }
  function stripQuery() {
    const url = new URL(location.href);
    url.searchParams.delete('editar-avion');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  function close() {
    if (saving) return;
    if (!same(draft, saved) && !confirm('Tenés cambios sin guardar. ¿Descartarlos?')) return;
    editing = false;
    draft = { ...saved };
    panel?.remove();
    panel = null;
    apply();
    stripQuery();
  }
  async function save() {
    if (!editing || saving || !window.gdvLegacyAdmin || same(draft, saved)) return;
    saving = true;
    render('Guardando la posición del avión…');
    let message = '', failed = false;
    try {
      const { data, error } = await db.from('gdv_home_aircraft_position')
        .upsert({
          id: 1, pos_x_pct: draft.x, pos_y_pct: draft.y,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
        .select('pos_x_pct,pos_y_pct').maybeSingle();
      if (error || !data) throw Error(error?.message || 'No se confirmó el guardado.');
      saved = normalize({ x: data.pos_x_pct, y: data.pos_y_pct });
      draft = { ...saved };
      message = 'Posición guardada: ya está disponible para todos en computadoras.';
    } catch (error) {
      message = 'No se pudo guardar: ' + (error.message || 'Error de conexión.');
      failed = true;
    } finally {
      saving = false;
      render(message, failed);
    }
  }
  async function reset() {
    if (!editing || saving || !window.gdvLegacyAdmin) return;
    if (!confirm('¿Restaurar la ubicación original del avión para todos?')) return;
    saving = true;
    render('Restaurando posición…');
    let message = '', failed = false;
    try {
      const { error } = await db.from('gdv_home_aircraft_position').delete().eq('id', 1);
      if (error) throw error;
      saved = { ...original };
      draft = { ...original };
      message = 'Se restauró la posición original.';
    } catch (error) {
      message = 'No se pudo restaurar: ' + (error.message || 'Error de conexión.');
      failed = true;
    } finally {
      saving = false;
      render(message, failed);
    }
  }
  function openEditor() {
    if (!wanted || !loaded || editing || !desktop() || !window.gdvLegacyAdmin) return;
    const params = new URLSearchParams(location.search);
    if (['editar-tarjetas','editar-marca','editar-video','editar-meteo'].some(key => params.has(key))) return;
    editing = true;
    panel = document.createElement('section');
    panel.id = 'gdvAircraftEditor';
    panel.setAttribute('aria-label', 'Editor de posición del avión de portada');
    panel.innerHTML =
      '<strong>AVIÓN DE PORTADA</strong>' +
      '<p>Mové la fotografía de fondo a izquierda, derecha, arriba o abajo. El logo, el menú y las tarjetas permanecen en su lugar.</p>' +
      '<div class="gdv-aircraft-axis"><label for="gdvAircraftX">Horizontal</label>' +
        '<input id="gdvAircraftX" type="range" min="0" max="100" step="1" aria-label="Posición horizontal del avión">' +
        '<output id="gdvAircraftXValue" for="gdvAircraftX"></output></div>' +
      '<div class="gdv-aircraft-axis"><label for="gdvAircraftY">Vertical</label>' +
        '<input id="gdvAircraftY" type="range" min="0" max="100" step="1" aria-label="Posición vertical del avión">' +
        '<output id="gdvAircraftYValue" for="gdvAircraftY"></output></div>' +
      '<div class="gdv-aircraft-nudges">' +
        '<button type="button" data-axis="x" data-step="-3" aria-label="Mover fondo a la izquierda">←</button>' +
        '<button type="button" data-axis="y" data-step="-3" aria-label="Mover fondo hacia arriba">↑</button>' +
        '<button type="button" data-axis="y" data-step="3" aria-label="Mover fondo hacia abajo">↓</button>' +
        '<button type="button" data-axis="x" data-step="3" aria-label="Mover fondo a la derecha">→</button>' +
      '</div>' +
      '<div class="gdv-aircraft-actions">' +
        '<button type="button" id="gdvAircraftSave">Guardar</button>' +
        '<button type="button" id="gdvAircraftReset">Restaurar original</button>' +
        '<button type="button" id="gdvAircraftExit">Terminar</button>' +
      '</div>' +
      '<p id="gdvAircraftStatus" role="status" aria-live="polite"></p>';
    document.body.append(panel);
    for (const axis of ['x', 'y']) {
      panel.querySelector('#gdvAircraft' + axis.toUpperCase())
        .addEventListener('input', event => change(axis, Number(event.target.value)));
    }
    panel.querySelectorAll('button[data-axis]').forEach(button => button.addEventListener('click', () => {
      const axis = button.dataset.axis;
      change(axis, draft[axis] + Number(button.dataset.step));
    }));
    panel.querySelector('#gdvAircraftSave').addEventListener('click', save);
    panel.querySelector('#gdvAircraftReset').addEventListener('click', reset);
    panel.querySelector('#gdvAircraftExit').addEventListener('click', close);
    render();
  }
  window.addEventListener('gdv-admin-ready', event => {
    if (event.detail?.isAdmin) openEditor();
  });
  window.addEventListener('resize', () => {
    if (editing && !desktop() && !saving) {
      editing = false;
      draft = { ...saved };
      panel?.remove();
      panel = null;
      stripQuery();
    }
    apply();
    openEditor();
  });
  async function load() {
    try {
      const { data, error } = await db.from('gdv_home_aircraft_position')
        .select('pos_x_pct,pos_y_pct').eq('id', 1).maybeSingle();
      if (error) throw error;
      if (data) saved = normalize({ x: data.pos_x_pct, y: data.pos_y_pct });
    } catch (error) {
      console.warn('No se pudo cargar la posición del avión de portada.');
    } finally {
      loaded = true;
      draft = { ...saved };
      apply();
      openEditor();
    }
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();
