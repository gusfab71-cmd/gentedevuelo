'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const client = window.GDV_AUTH?.client;
  const errors = {
    not_configured: 'La revisión con Gemini todavía no está habilitada en el servidor.',
    unauthorized: 'Tu sesión venció. Volvé a ingresar.',
    forbidden: 'Esta función es exclusiva de la cuenta administradora.',
    invalid_input: 'Completá el título, el código y la autorización.',
    possible_secret: 'El código parece contener una clave o dato secreto. Eliminá ese dato antes de continuar.',
    too_large: 'El fragmento es demasiado extenso. Seleccioná una parte más pequeña.',
    slow_down: 'Se alcanzó el límite temporal de consultas. Intentá más tarde.',
    google_quota: 'La cuota de Gemini está agotada. No se repetirá automáticamente.',
    google_key_rejected: 'Google rechazó la clave de API. Revisar configuración.',
    google_model_unavailable: 'El modelo Gemini no está disponible para esta clave.',
    google_bad_request: 'Google rechazó la solicitud de revisión.',
    empty_response: 'Gemini respondió sin texto utilizable.',
    timeout: 'La consulta tardó demasiado. No se repetirá automáticamente.',
    temporarily_unavailable: 'El servicio no está disponible en este momento.',
    gemini_unavailable: 'No se pudo completar la consulta a Gemini.'
  };

  async function init() {
    if (!client) { $('access-state').textContent = 'No se pudo iniciar la verificación de acceso.'; return; }
    try {
      const { data: { user }, error } = await client.auth.getUser();
      if (error || !user) {
        $('access-state').textContent = 'Ingresá con tu cuenta de Gente de Vuelo para continuar.';
        return;
      }
      const permission = await client.from('site_admins').select('user_id').eq('user_id', user.id).maybeSingle();
      if (permission.error || !permission.data) {
        $('access-state').textContent = 'Acceso reservado a administradores.';
        return;
      }
      $('access-state').textContent = 'Acceso administrativo verificado. Las consultas están sujetas a la habilitación del servidor.';
      $('audit-panel').hidden = false;
    } catch (_) {
      $('access-state').textContent = 'No se pudo comprobar la sesión.';
    }
  }

  $('audit-diff').addEventListener('input', () => {
    $('audit-count').textContent = $('audit-diff').value.length.toLocaleString('es-AR') + ' / 12.000 caracteres';
  });

  $('audit-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('audit-submit');
    button.disabled = true;
    $('audit-state').textContent = 'Solicitando revisión…';
    $('audit-result').hidden = true;
    try {
      const { data: { session }, error } = await client.auth.getSession();
      if (error || !session?.access_token) throw new Error('unauthorized');
      const response = await fetch('/api/gemini-code-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ title: $('audit-title').value, diff: $('audit-diff').value, consent: $('audit-consent').checked })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'temporarily_unavailable');
      $('audit-answer').textContent = data.answer || 'Sin observaciones.';
      $('audit-result').hidden = false;
      $('audit-state').textContent = 'Revisión recibida. Validá cada observación antes de cualquier cambio.';
    } catch (error) {
      $('audit-state').textContent = errors[error.message] || 'No se pudo completar la solicitud.';
      $('audit-state').classList.add('danger');
    } finally {
      button.disabled = false;
    }
  });

  init();
})();
