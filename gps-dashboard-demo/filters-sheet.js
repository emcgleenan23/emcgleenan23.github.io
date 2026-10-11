/* Phones and narrow tablets: the filter sidebar becomes a bottom sheet so the
   charts come first. The sheet tracks the finger 1:1, can be grabbed
   mid-animation, and a flick or a long drag down dismisses it (Apple-style
   spring: damping 0.8, response 0.3 s, release velocity handed over). */
(function () {
  'use strict';
  var side = document.querySelector('.side');
  var app = document.getElementById('app') || document.body;
  if (!side) return;

  var css = [
    '@media (max-width: 900px) {',
    '  .side { position: fixed !important; left: 0; right: 0; bottom: 0; top: auto !important; z-index: 70;',
    '    max-height: 82vh !important; overflow: auto; border: 0 !important; border-radius: 18px 18px 0 0;',
    '    background: var(--side); box-shadow: 0 -12px 40px rgba(0,0,0,.18);',
    '    padding: 8px 18px calc(28px + env(safe-area-inset-bottom)) !important;',
    '    transform: translate3d(0, 110%, 0); will-change: transform; visibility: hidden; overscroll-behavior: contain; }',
    '  .side.sheet-live { visibility: visible; }',
    '  .sheet-grab { position: sticky; top: -8px; z-index: 2; margin: -8px -18px 6px; padding: 10px 18px 8px; background: var(--side);',
    '    display: flex; align-items: center; justify-content: space-between; touch-action: none; cursor: grab; }',
    '  .sheet-grab::before { content: ""; position: absolute; left: 50%; top: 6px; width: 38px; height: 5px; margin-left: -19px;',
    '    border-radius: 3px; background: #d6d2c8; }',
    '  .sheet-grab strong { font-family: var(--sora); font-size: 15px; margin-top: 10px; }',
    '  .sheet-done { margin-top: 10px; font: 600 13.5px var(--sora); color: #fff; background: var(--dark); border: 0;',
    '    border-radius: 999px; padding: 9px 16px; min-height: 40px; cursor: pointer; }',
    '  .sheet-scrim { position: fixed; inset: 0; z-index: 69; background: rgba(12,14,18,.42); opacity: 0; visibility: hidden; }',
    '  .sheet-scrim.sheet-live { visibility: visible; }',
    '  .sheet-fab { position: fixed; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom)); z-index: 60;',
    '    transform: translateX(-50%); display: inline-flex; align-items: center; gap: 8px;',
    '    font: 600 14px var(--sora); color: #fff; background: var(--dark); border: 0; border-radius: 999px;',
    '    padding: 12px 20px; min-height: 46px; box-shadow: 0 10px 30px rgba(0,0,0,.25); cursor: pointer;',
    '    transition: transform .12s ease-out; -webkit-tap-highlight-color: transparent; }',
    '  .sheet-fab:active { transform: translateX(-50%) scale(.96); }',
    '  .sheet-fab svg { width: 17px; height: 17px; }',
    '  .main { padding-bottom: 96px !important; }',
    '}',
    '@media (min-width: 901px) { .sheet-grab, .sheet-scrim, .sheet-fab { display: none !important; } }',
    '@media (max-width: 900px) and (prefers-reduced-motion: reduce) { .sheet-fab:active { transform: translateX(-50%); } }'
  ].join('\n');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var grab = document.createElement('div');
  grab.className = 'sheet-grab';
  grab.innerHTML = '<strong>Filters</strong><button type="button" class="sheet-done">Show charts</button>';
  side.insertBefore(grab, side.firstChild);
  side.setAttribute('role', 'dialog');
  side.setAttribute('aria-modal', 'true');
  side.id = side.id || 'filters';

  var scrim = document.createElement('div');
  scrim.className = 'sheet-scrim';
  var fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'sheet-fab';
  fab.setAttribute('aria-controls', side.id);
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Filters';
  app.appendChild(scrim);
  app.appendChild(fab);

  var mq = window.matchMedia('(max-width: 900px)');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // spring state (y = px pushed down from the open position)
  var y = 0, v = 0, target = 0, raf = 0, isOpen = false;
  function H() { return side.getBoundingClientRect().height || window.innerHeight * 0.8; }
  function paint() {
    side.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
    scrim.style.opacity = Math.max(0, 1 - y / H()).toFixed(3);
  }
  function springTo(to, opts, done) {
    target = to;
    if (opts.velocity !== undefined) v = opts.velocity;
    cancelAnimationFrame(raf);
    if (reduce) { y = to; v = 0; paint(); if (done) done(); return; }
    var w = 2 * Math.PI / opts.response, z = opts.dampingRatio, last = performance.now();
    (function step(now) {
      var dt = Math.min(0.064, (now - last) / 1000); last = now;
      for (var i = 0, h = dt / 4; i < 4; i++) {
        var a = -w * w * (y - target) - 2 * z * w * v;
        v += a * h; y += v * h;
        if (opts.clamp && y > target && target > 0) { y = target; v = 0; }
      }
      paint();
      if (Math.abs(y - target) < 0.5 && Math.abs(v) < 5) { y = target; v = 0; paint(); raf = 0; if (done) done(); }
      else raf = requestAnimationFrame(step);
    })(last);
  }
  function project(vel) { return (vel / 1000) * 0.998 / (1 - 0.998); }
  function rubber(d, dim) { return (d * dim * 0.55) / (dim + 0.55 * Math.abs(d)); }

  var lastFocus = null;
  function open() {
    if (!mq.matches) return;
    lastFocus = document.activeElement;
    if (!isOpen && !raf) { y = H(); paint(); }
    isOpen = true;
    side.classList.add('sheet-live'); scrim.classList.add('sheet-live');
    fab.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    springTo(0, { dampingRatio: 1, response: 0.32 });
    var first = side.querySelector('.sheet-done');
    if (first) first.focus({ preventScroll: true });
  }
  function close(vel) {
    if (!isOpen) return;
    isOpen = false;
    fab.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    springTo(H(), { dampingRatio: 1, response: 0.3, velocity: vel, clamp: true }, function () {
      if (isOpen) return;
      side.classList.remove('sheet-live'); scrim.classList.remove('sheet-live');
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    });
  }

  fab.addEventListener('click', open);
  scrim.addEventListener('click', function () { close(); });
  grab.querySelector('.sheet-done').addEventListener('click', function () { close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) close(); });

  // drag the handle (or the sheet when scrolled to the top) to move it
  var drag = null;
  function down(e) {
    if (!isOpen) return;
    var onGrab = grab.contains(e.target) && !e.target.closest('button');
    if (!onGrab && side.scrollTop > 0) return;
    if (!onGrab && e.target.closest('select, input, button, .seg, .checks')) return;
    drag = { id: e.pointerId, sy: e.clientY, oy: y, hist: [{ y: e.clientY, t: e.timeStamp }], live: false, onGrab: onGrab };
    cancelAnimationFrame(raf); raf = 0;    // grab it mid-flight
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dy = e.clientY - drag.sy;
    if (!drag.live) {
      if (Math.abs(dy) < 8) return;
      if (!drag.onGrab && dy < 0) { drag = null; return; }   // let the list scroll up
      drag.live = true;
      side.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
    drag.hist.push({ y: e.clientY, t: e.timeStamp });
    if (drag.hist.length > 6) drag.hist.shift();
    var next = drag.oy + dy;
    y = next >= 0 ? next : rubber(next, H());   // resists above the open position
    paint();
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag; drag = null;
    if (!d.live) return;
    var a = d.hist[0], b = d.hist[d.hist.length - 1];
    var vel = b.t > a.t ? (b.y - a.y) / ((b.t - a.t) / 1000) : 0;
    if (y + project(vel) > H() * 0.4) close(vel);
    else springTo(0, { dampingRatio: 0.8, response: 0.3, velocity: vel });
  }
  side.addEventListener('pointerdown', down);
  side.addEventListener('pointermove', move, { passive: false });
  side.addEventListener('pointerup', up);
  side.addEventListener('pointercancel', up);

  // crossing back to desktop width: reset everything
  function reset() {
    if (mq.matches) return;
    isOpen = false; cancelAnimationFrame(raf); raf = 0;
    side.style.transform = ''; side.classList.remove('sheet-live'); scrim.classList.remove('sheet-live');
    document.body.style.overflow = '';
  }
  if (mq.addEventListener) mq.addEventListener('change', reset); else mq.addListener(reset);
})();
