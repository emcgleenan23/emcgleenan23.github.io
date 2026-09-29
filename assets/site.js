/* Shared behaviour for the portfolio: nav shadow + active section,
   reading progress, image lightbox and scroll reveal. No dependencies. */
(function () {
  var nav = document.querySelector('nav');
  var bar = document.querySelector('.progress');

  function onScroll() {
    var y = window.scrollY;
    if (nav) nav.classList.toggle('scrolled', y > 8);
    if (bar) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? Math.min(100, (y / h) * 100) : 0) + '%';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Highlight the nav link for the section in view (homepage anchors only)
  var links = Array.prototype.slice.call(document.querySelectorAll('nav ul a[href^="#"]'));
  if (links.length && 'IntersectionObserver' in window) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove('active'); });
        var a = byId[e.target.id];
        if (a) a.classList.add('active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) spy.observe(el);
    });
  }

  // Lightbox for screenshots, figures and anything marked data-zoom
  var imgs = document.querySelectorAll('.screenshot img, .article figure:not(.article-cover) img, img[data-zoom]');
  if (imgs.length) {
    var lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.innerHTML = '<button type="button" aria-label="Close">&times;</button><img alt=""><p></p>';
    document.body.appendChild(lb);
    var big = lb.querySelector('img'), cap = lb.querySelector('p');
    function close() { lb.classList.remove('open'); document.body.style.overflow = ''; }
    Array.prototype.forEach.call(imgs, function (img) {
      img.setAttribute('tabindex', '0');
      function open() {
        big.src = img.getAttribute('data-full') || img.currentSrc || img.src;
        big.alt = img.alt;
        var fc = img.closest('figure') && img.closest('figure').querySelector('figcaption');
        cap.textContent = fc ? fc.textContent : img.alt;
        lb.classList.add('open');
        document.body.style.overflow = 'hidden';
      }
      img.addEventListener('click', open);
      img.addEventListener('keydown', function (e) { if (e.key === 'Enter') open(); });
    });
    lb.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  // Scroll reveal
  var rev = document.querySelectorAll('.reveal');
  if (rev.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    Array.prototype.forEach.call(rev, function (el) { io.observe(el); });
  } else {
    Array.prototype.forEach.call(rev, function (el) { el.classList.add('in'); });
  }
})();
