/* main.js — arranque */
(function () {
  function boot() {
    Coach.UI.init();
    // PWA: permite instalarla en el celular y abrirla sin internet (solo en http/https).
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
