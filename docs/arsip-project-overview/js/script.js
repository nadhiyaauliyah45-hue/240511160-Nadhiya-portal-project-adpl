/* =========================================================
   ANIMASI: fade-in tiap stasiun saat masuk layar
   ========================================================= */
function initReveal() {
  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('visible'); });
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    });
  }, { threshold: 0.12 });
  items.forEach(function (el) { observer.observe(el); });
}

/* =========================================================
   TRANSISI: efek halus saat pindah ke Website 1
   ========================================================= */
function initPageTransition() {
  document.querySelectorAll('[data-nav]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var target = a.getAttribute('href');
      document.body.classList.add('leaving');
      setTimeout(function () { window.location.href = target; }, 340);
    });
  });
  window.addEventListener('pageshow', function () { document.body.classList.remove('leaving'); });
}

/* =========================================================
   INISIALISASI
   ========================================================= */
document.addEventListener('DOMContentLoaded', function () {
  initReveal();
  initPageTransition();
});
