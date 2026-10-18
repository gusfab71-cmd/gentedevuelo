'use strict';
(() => {
  // Complemento independiente: no altera el cálculo ni el informe de Flight Operations.
  function mount() {
    if (document.documentElement.dataset.flightRole !== 'admin') return;
    const host = document.getElementById('informe-esencial');
    if (!host || document.getElementById('gdv-gemini-audit')) return;

    const panel = document.createElement('details');
    panel.id = 'gdv-gemini-audit';
    panel.className = 'gdv-gemini-audit';
    panel.innerHTML = `
      <summary><span class="gdv-gemini-tag">SEGUNDA OPINIÓN · SOLO ADMIN</span><strong>Auditoría técnica con Gemini</strong><span class="gdv-gemini-plus" aria-hidden="true">+</span></summary>
      <div class="gdv-gemini-inner">
        <p>Compara cálculos mediante ejercicios ficticios. No se envían datos del vuelo, perfiles ni boletines. La opinión de la IA no valida operaciones reales.</p>
        <label class="gdv-gemini-field" for="gdv-gemini-case">Ejercicio de auditoría
          <select id="gdv-gemini-case">
            <option value="tas">IAS → TAS · altitud y temperatura</option>
            <option value="wind">Viento · deriva, rumbo y GS</option>
            <option value="fuel">Combustible · contingencia y reserva</option>
          </select>
        </label>
        <label class="gdv-gemini-consent"><input id="gdv-gemini-consent" type="checkbox"><span>Autorizo una consulta a Gemini para este caso ficticio y su consumo de cuota de API.</span></label>
        <div class="gdv-gemini-controls"><button id="gdv-gemini-run" type="button" class="secondary">Auditar ejemplo con Gemini</button><span id="gdv-gemini-status" role="status" aria-live="polite">Todavía no se realizó ninguna consulta.</span></div>
        <section id="gdv-gemini-result" class="gdv-gemini-result" hidden><strong>Observaciones del segundo revisor</strong><div id="gdv-gemini-answer"></div></section>
        <p class="gdv-gemini-disclaimer">Uso educativo. Los resultados deben comprobarse con procedimientos aeronáuticos y documentación oficial.</p>
      </div>`;
    host.append(panel);

    const byId = id => panel.querySelector('#' + id);
    const button = byId('gdv-gemini-run');
    const status = byId('gdv-gemini-status');
    const selector = byId('gdv-gemini-case');
    const consent = byId('gdv-gemini-consent');
    const result = byId('gdv-gemini-result');
    const answer = byId('gdv-gemini-answer');

    selector.addEventListener('change', () => { consent.checked = false; result.hidden = true; });
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      if (!consent.checked) { status.textContent = 'Confirmá la autorización para consultar.'; return; }
      button.disabled = true;
      result.hidden = true;
      status.textContent = 'Consultando únicamente el ejemplo ficticio…';
      try {
        const auth = window.GDV_AUTH?.client;
        const {data, error} = await auth.auth.getSession();
        if (error || !data?.session?.access_token) throw new Error('La sesión caducó. Ingresá nuevamente.');
        const response = await fetch('/api/gemini-audit', {
          method: 'POST',
          headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token},
          credentials: 'same-origin',
          body: JSON.stringify({caseId: selector.value})
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const messages = {
            not_configured: 'Gemini está preparado, pero todavía no fue habilitado en Vercel.',
            forbidden: 'La consulta está reservada al administrador.',
            unauthorized: 'La sesión no es válida. Ingresá nuevamente.',
            slow_down: 'Esperá un minuto antes de otra auditoría.',
            google_quota: 'Google informa que se alcanzó la cuota disponible.',
            google_bad_request: 'Google rechazó la solicitud del modelo. Revisaremos su configuración.',
            google_key_rejected: 'Google rechazó la clave o el acceso a Gemini API. Revisaremos los permisos.',
            google_model_unavailable: 'Este modelo Gemini no está disponible para la clave configurada.',
            gemini_unavailable: 'Gemini no respondió correctamente. Intentá más tarde.',
            temporarily_unavailable: 'El servicio no está disponible por ahora.'
          };
          throw new Error(messages[payload.error] || 'No se pudo completar la auditoría.');
        }
        answer.textContent = payload.answer;
        result.hidden = false;
        status.textContent = 'Auditoría ficticia terminada · ' + payload.model;
      } catch (error) {
        status.textContent = error.message || 'Error al consultar Gemini.';
      } finally {
        button.disabled = false;
        consent.checked = false;
      }
    });
  }

  document.addEventListener('gdv-flight-role-ready', mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
