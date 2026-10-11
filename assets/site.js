/* Shared behaviour for the portfolio: nav state, reading progress, section
   highlighting, nav overflow hint, image lightbox and scroll reveal.
   No dependencies. */
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Nav shadow + reading progress (one rAF per scroll burst) ─────────── */
  var nav = document.querySelector('nav');
  var bar = document.querySelector('.progress');
  var ticking = false;
  function paintScroll() {
    ticking = false;
    var y = window.scrollY;
    if (nav) nav.classList.toggle('scrolled', y > 8);
    if (bar) {
      var h = doc.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, y / h) : 0) + ')';
    }
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(paintScroll); }
  }, { passive: true });
  paintScroll();

  /* ── Mobile nav: fade the edge while there are more links to scroll to ── */
  var navList = document.querySelector('nav ul');
  if (navList) {
    var checkOverflow = function () {
      var over = navList.scrollWidth > navList.clientWidth + 2;
      navList.classList.toggle('overflows', over);
      navList.classList.toggle('at-end', over && navList.scrollLeft + navList.clientWidth >= navList.scrollWidth - 4);
    };
    navList.addEventListener('scroll', checkOverflow, { passive: true });
    window.addEventListener('resize', checkOverflow);
    checkOverflow();
  }

  /* ── Highlight the link for the section in view ───────────────────────── */
  function spy(selector) {
    var links = Array.prototype.slice.call(document.querySelectorAll(selector));
    if (!links.length || !('IntersectionObserver' in window)) return;
    var byId = {};
    links.forEach(function (a) { byId[decodeURIComponent(a.getAttribute('href').slice(1))] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var a = byId[e.target.id];
        if (!a) return;
        links.forEach(function (l) { l.classList.remove('active'); l.removeAttribute('aria-current'); });
        a.classList.add('active');
        a.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }
  spy('nav ul a[href^="#"]');

  /* ── Open a collapsed section when a link points into it ─────────────── */
  function openTarget() {
    var id = decodeURIComponent(location.hash.slice(1));
    var el = id && document.getElementById(id);
    var d = el && el.closest('details');
    if (d && !d.open) { d.open = true; el.scrollIntoView(); }
  }
  window.addEventListener('hashchange', openTarget);
  openTarget();
  // Contents links: the current section is the last heading above 30% of
  // the viewport (headings are thin, so position beats intersection here)
  (function tocSpy() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]'));
    var items = links.map(function (a) {
      return { a: a, el: document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))) };
    }).filter(function (x) { return x.el; });
    if (!items.length) return;
    var current = null, queued = false;
    function update() {
      queued = false;
      var line = window.innerHeight * 0.3, pick = items[0];
      for (var i = 0; i < items.length; i++) {
        if (items[i].el.getBoundingClientRect().top <= line) pick = items[i]; else break;
      }
      if (pick === current) return;
      if (current) { current.a.classList.remove('active'); current.a.removeAttribute('aria-current'); }
      pick.a.classList.add('active'); pick.a.setAttribute('aria-current', 'true');
      current = pick;
    }
    window.addEventListener('scroll', function () { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener('resize', update);
    update();
  })();

  /* ── Springs ──────────────────────────────────────────────────────────────
     Apple-style parameters: dampingRatio (1 = no overshoot) and response
     (seconds to roughly reach the target). Each property is its own spring,
     always starting from its current on-screen value and velocity, so any
     animation can be grabbed or reversed mid-flight. */
  function Spring(value) { this.x = value; this.v = 0; this.target = value; }
  function Animator(props, onFrame) {
    this.s = {};
    for (var k in props) this.s[k] = new Spring(props[k]);
    this.onFrame = onFrame;
    this.raf = 0;
  }
  Animator.prototype.to = function (targets, opts, done) {
    var self = this;
    var zeta = opts.dampingRatio, omega = 2 * Math.PI / opts.response;
    var vel = opts.velocity || {};
    for (var k in targets) {
      self.s[k].target = targets[k];
      if (vel[k] !== undefined) self.s[k].v = vel[k];
    }
    cancelAnimationFrame(self.raf);
    var last = performance.now();
    function step(now) {
      var dt = Math.min(0.064, (now - last) / 1000); last = now;
      var settled = true;
      var n = 4, h = dt / n;           // sub-steps keep stiff springs stable
      for (var key in self.s) {
        var sp = self.s[key];
        for (var i = 0; i < n; i++) {
          var a = -omega * omega * (sp.x - sp.target) - 2 * zeta * omega * sp.v;
          sp.v += a * h; sp.x += sp.v * h;
        }
        var scale = Math.max(1, Math.abs(sp.target));
        if (Math.abs(sp.x - sp.target) > 0.0005 * scale || Math.abs(sp.v) > 0.01 * scale) settled = false;
      }
      if (settled) { for (var k2 in self.s) { self.s[k2].x = self.s[k2].target; self.s[k2].v = 0; } }
      self.onFrame(self.s);
      if (settled) { self.raf = 0; if (done) done(); }
      else self.raf = requestAnimationFrame(step);
    }
    self.raf = requestAnimationFrame(step);
  };
  Animator.prototype.set = function (values) {
    cancelAnimationFrame(this.raf); this.raf = 0;
    for (var k in values) { this.s[k].x = this.s[k].target = values[k]; this.s[k].v = 0; }
    this.onFrame(this.s);
  };

  // Where a flick would come to rest (Apple's exponential-decay projection)
  function project(velocity, rate) {
    rate = rate || 0.998;
    return (velocity / 1000) * rate / (1 - rate);
  }

  /* ── Lightbox ─────────────────────────────────────────────────────────── */
  var imgs = document.querySelectorAll('.screenshot img, .article figure:not(.article-cover) img, img[data-zoom]');
  if (imgs.length) {
    var lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Image viewer');
    lb.innerHTML =
      '<div class="scrim"></div>' +
      '<img class="lb-img" alt="" draggable="false">' +
      '<p class="lb-cap"></p>' +
      '<button type="button" class="lb-close" aria-label="Close image">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
    document.body.appendChild(lb);
    var scrim = lb.querySelector('.scrim'), big = lb.querySelector('.lb-img');
    var cap = lb.querySelector('.lb-cap'), closeBtn = lb.querySelector('.lb-close');
    var source = null, frame = null, isOpen = false;

    var anim = new Animator({ x: 0, y: 0, s: 1, o: 0 }, function (s) {
      big.style.transform = 'translate3d(' + s.x.x + 'px,' + s.y.x + 'px,0) scale(' + s.s.x + ')';
      var o = Math.max(0, Math.min(1, s.o.x));
      scrim.style.opacity = (o * 0.9).toFixed(3);
      cap.style.opacity = closeBtn.style.opacity = o.toFixed(3);
    });

    // final, centred rectangle for the image
    function fitFrame() {
      var vw = window.innerWidth, vh = window.innerHeight;
      var nw = big.naturalWidth || source.naturalWidth || 1200;
      var nh = big.naturalHeight || source.naturalHeight || 800;
      var pad = vw < 600 ? 12 : 40, capSpace = cap.textContent ? 72 : 24;
      var maxW = vw - pad * 2, maxH = vh - 64 - capSpace;
      var k = Math.min(maxW / nw, maxH / nh, 1.6);
      var w = nw * k, h = nh * k;
      return { w: w, h: h, x: (vw - w) / 2, y: Math.max(56, (vh - capSpace - h) / 2 + 20) };
    }
    // transform that makes the full-size frame sit exactly over the thumbnail
    function thumbPose() {
      var r = source.getBoundingClientRect();
      var s = r.width / frame.w;
      return { x: r.left, y: r.top + (r.height - frame.h * s) / 2, s: s };
    }

    function open(img) {
      source = img;
      big.src = img.getAttribute('data-full') || img.currentSrc || img.src;
      big.alt = img.alt;
      var fc = img.closest('figure') && img.closest('figure').querySelector('figcaption');
      cap.textContent = fc ? fc.textContent.trim() : img.alt;
      lb.classList.add('open');
      document.body.style.overflow = 'hidden';
      frame = fitFrame();
      big.style.width = frame.w + 'px'; big.style.height = frame.h + 'px';
      isOpen = true;
      if (reduceMotion) {
        anim.set({ x: frame.x, y: frame.y, s: 1, o: 0 });
        anim.to({ o: 1 }, { dampingRatio: 1, response: 0.25 });
      } else {
        var p = thumbPose();
        if (!lb.dataset.active) anim.set({ x: p.x, y: p.y, s: p.s, o: 0 });
        source.style.visibility = 'hidden';
        anim.to({ x: frame.x, y: frame.y, s: 1, o: 1 }, { dampingRatio: 1, response: 0.38 });
      }
      lb.dataset.active = '1';
      closeBtn.focus({ preventScroll: true });
    }

    function close(velocity) {
      if (!isOpen) return;
      isOpen = false;
      var finish = function () {
        if (isOpen) return;                 // re-opened mid-flight
        lb.classList.remove('open');
        delete lb.dataset.active;
        if (source) { source.style.visibility = ''; source.focus({ preventScroll: true }); }
        document.body.style.overflow = '';
      };
      if (reduceMotion) { anim.to({ o: 0 }, { dampingRatio: 1, response: 0.2 }, finish); return; }
      var p = thumbPose();
      // same path out as in; carry the finger's speed into the return
      anim.to({ x: p.x, y: p.y, s: p.s, o: 0 },
        { dampingRatio: 1, response: 0.34, velocity: velocity ? { y: velocity } : undefined }, finish);
    }

    Array.prototype.forEach.call(imgs, function (img) {
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      img.setAttribute('data-zoomable', '');
      if (!img.getAttribute('aria-label')) img.setAttribute('aria-label', 'Enlarge image: ' + (img.alt || 'figure'));
      img.addEventListener('click', function () { open(img); });
      img.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(img); }
      });
    });

    closeBtn.addEventListener('click', function (e) { e.stopPropagation(); close(); });
    scrim.addEventListener('click', function () { close(); });
    cap.addEventListener('click', function () { close(); });
    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); }   // keep focus in the dialog
    });
    window.addEventListener('resize', function () {
      if (!isOpen) return;
      frame = fitFrame();
      big.style.width = frame.w + 'px'; big.style.height = frame.h + 'px';
      anim.set({ x: frame.x, y: frame.y, s: 1, o: 1 });
    });

    /* Drag to dismiss: the image follows the finger 1:1; the background fades
       with distance; on release a flick or a long drag closes, otherwise it
       springs home. Sideways movement is damped (rubber-band). */
    var drag = null;
    function rubber(d, dim) { return (d * dim * 0.55) / (dim + 0.55 * Math.abs(d)); }
    big.addEventListener('pointerdown', function (e) {
      if (!isOpen || e.button > 0) return;
      big.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY,
               ox: anim.s.x.x, oy: anim.s.y.x, moved: false, hist: [{ y: e.clientY, t: e.timeStamp }] };
      cancelAnimationFrame(anim.raf);              // grab it mid-flight
    });
    big.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      big.classList.add('dragging');
      drag.hist.push({ y: e.clientY, t: e.timeStamp });
      if (drag.hist.length > 6) drag.hist.shift();
      var fade = 1 - Math.min(1, Math.abs(dy) / (window.innerHeight * 0.5));
      anim.set({ x: drag.ox + rubber(dx, window.innerWidth), y: drag.oy + dy, s: 1 - (1 - fade) * 0.12, o: Math.max(0.15, fade) });
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag; drag = null;
      big.classList.remove('dragging');
      if (!d.moved) { close(); return; }          // a tap on the image closes it
      var h = d.hist, a = h[0], b = h[h.length - 1];
      var v = b.t > a.t ? (b.y - a.y) / ((b.t - a.t) / 1000) : 0;   // px/s
      var travelled = anim.s.y.x - frame.y;
      if (Math.abs(travelled + project(v)) > window.innerHeight * 0.22) close(v);
      else anim.to({ x: frame.x, y: frame.y, s: 1, o: 1 }, { dampingRatio: 0.8, response: 0.32, velocity: { y: v } });
    }
    big.addEventListener('pointerup', endDrag);
    big.addEventListener('pointercancel', endDrag);
  }

  /* ── Scroll reveal (below-the-fold sections only) ─────────────────────── */
  var rev = document.querySelectorAll('.reveal');
  if (rev.length && 'IntersectionObserver' in window) {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    Array.prototype.forEach.call(rev, function (el) { ro.observe(el); });
  } else {
    Array.prototype.forEach.call(rev, function (el) { el.classList.add('in'); });
  }
})();
