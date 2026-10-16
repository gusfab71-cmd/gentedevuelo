/* Gente de Vuelo: la portada sigue el horario local de cada visitante. */
(function () {
  'use strict';

  var script = document.currentScript;
  var base = new URL('../', script.src);
  var images = {
    manana: new URL('portada-manana-tres-palas.webp', base).href,
    tarde: new URL('portada-tarde-tres-palas.webp', base).href,
    noche: new URL('portada-noche-tres-palas.webp', base).href
  };
  var activePeriod = '';

  function updateCover() {
    var hour = new Date().getHours();
    var period = hour >= 6 && hour < 12 ? 'manana'
      : hour >= 12 && hour < 20 ? 'tarde' : 'noche';

    if (period === activePeriod) return;
    document.documentElement.style.setProperty('--gdv-portada-imagen', 'url("' + images[period] + '")');
    document.documentElement.setAttribute('data-portada-horaria', period);
    activePeriod = period;
  }

  updateCover();
  window.setInterval(updateCover, 30 * 1000);
  window.addEventListener('focus', updateCover);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) updateCover();
  });
})();
