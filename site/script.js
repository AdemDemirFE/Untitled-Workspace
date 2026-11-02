/* Deniz Yılmaz — portfolyo (yer tutucu içerik)
   Saf JavaScript, bağımlılık yok. file:// üzerinden çalışır.

   Bölümler:
   - initTyping      : hero daktilo efekti (#typed)
   - initCanvas      : hero canvas arka planı (#hero-canvas), parçacıklar + çizgiler
   - initReveal      : IntersectionObserver ile kademeli görünme (.reveal) + sayaçlar
   - (CSS)           : yetenek çubukları .skill__fill, .is-visible gelince dolar
   - initTilt        : proje kartı 3B eğilme ([data-tilt]), yalnızca fare/hover cihazlar
   - initNav         : mobil menü, kaydırma izleme (aktif bağlantı), sticky başlık gölgesi
   - initProgress    : sayfa kaydırma ilerleme çubuğu (#progress-bar)
   - initCopy        : e-posta "Kopyala" düğmesi (Clipboard API + yedek)
*/
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointerMQ = window.matchMedia('(hover: hover) and (pointer: fine)');

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* addEventListener for MediaQueryList (Safari < 14 uses addListener) */
  function onMQChange(mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  }

  /* ------------------------------------------------------------------
     Daktilo efekti
     ------------------------------------------------------------------ */
  function initTyping() {
    var el = $('#typed');
    if (!el) return;

    var roles = ['Frontend geliştirici', 'Backend geliştirici', 'DevOps meraklısı', 'Full-Stack mühendis'];
    var staticText = 'Full-Stack geliştirici';
    var roleIdx = 0, charIdx = 0, deleting = false, timer = 0;

    function stop() { clearTimeout(timer); timer = 0; }

    function tick() {
      var full = roles[roleIdx];
      charIdx += deleting ? -1 : 1;
      el.textContent = full.slice(0, charIdx);

      var delay = deleting ? 35 : 75;
      if (!deleting && charIdx === full.length) {
        deleting = true;
        delay = 1500;                       // tam yazıldı, bekle
      } else if (deleting && charIdx === 0) {
        deleting = false;
        roleIdx = (roleIdx + 1) % roles.length;
        delay = 350;
      }
      timer = setTimeout(tick, delay);
    }

    function start() {
      stop();
      if (reduceMQ.matches) { el.textContent = staticText; return; }
      el.textContent = '';
      roleIdx = 0; charIdx = 0; deleting = false;
      timer = setTimeout(tick, 600);
    }

    /* Sekme gizliyken zamanlayıcıyı durdur */
    document.addEventListener('visibilitychange', function () {
      if (reduceMQ.matches) return;
      if (document.hidden) stop();
      else if (!timer) timer = setTimeout(tick, 200);
    });
    onMQChange(reduceMQ, start);
    start();
  }

  /* ------------------------------------------------------------------
     Hero canvas: parçacıklar + bağlantı çizgileri
     ------------------------------------------------------------------ */
  function initCanvas() {
    var canvas = $('#hero-canvas');
    var hero = $('#hero');
    if (!canvas || !hero || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var w = 0, h = 0, dpr = 1;
    var particles = [];
    var raf = 0, last = 0;
    var heroVisible = true;
    var rgb = '139 123 255';
    var pointer = { x: -9999, y: -9999 };
    var LINK_DIST = 125, POINTER_DIST = 160;

    function readColor() {
      var v = getComputedStyle(root).getPropertyValue('--canvas-rgb').trim();
      if (v) rgb = v;
    }

    function makeParticle() {
      var speed = 14 + Math.random() * 22;            // px / sn
      var angle = Math.random() * Math.PI * 2;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 1.2 + Math.random() * 1.6
      };
    }

    function resize() {
      var rect = hero.getBoundingClientRect();
      var nw = Math.max(1, Math.round(rect.width));
      var nh = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(nw * dpr);
      canvas.height = Math.round(nh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var sx = w ? nw / w : 1, sy = h ? nh / h : 1;
      w = nw; h = nh;
      particles.forEach(function (p) { p.x *= sx; p.y *= sy; });

      var target = Math.max(18, Math.min(95, Math.round((w * h) / 15000)));
      while (particles.length < target) particles.push(makeParticle());
      if (particles.length > target) particles.length = target;

      if (!isRunning()) draw();                       // durağan kare
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      var i, j, a, b, dx, dy, d, alpha;

      for (i = 0; i < particles.length; i++) {
        a = particles[i];
        for (j = i + 1; j < particles.length; j++) {
          b = particles[j];
          dx = a.x - b.x; dy = a.y - b.y;
          d = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK_DIST) {
            alpha = (1 - d / LINK_DIST) * 0.4;
            ctx.strokeStyle = 'rgb(' + rgb + ' / ' + alpha.toFixed(3) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        dx = a.x - pointer.x; dy = a.y - pointer.y;
        d = Math.sqrt(dx * dx + dy * dy);
        if (d < POINTER_DIST) {
          alpha = (1 - d / POINTER_DIST) * 0.7;
          ctx.strokeStyle = 'rgb(' + rgb + ' / ' + alpha.toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
        }
      }

      ctx.fillStyle = 'rgb(' + rgb + ' / 0.85)';
      for (i = 0; i < particles.length; i++) {
        a = particles[i];
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
      }
    }

    function step(dt) {
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
        else if (p.x > w) { p.x = w; p.vx = -Math.abs(p.vx); }
        if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy); }
        else if (p.y > h) { p.y = h; p.vy = -Math.abs(p.vy); }
      }
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      var dt = Math.min(0.05, (now - last) / 1000);   // sekme dönüşünde sıçramayı sınırla
      last = now;
      step(dt);
      draw();
    }

    function isRunning() { return raf !== 0; }

    function shouldRun() { return heroVisible && !document.hidden && !reduceMQ.matches; }

    function sync() {
      if (shouldRun()) {
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
      } else {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        draw();                                       // durağan kare (azaltılmış hareket / gizli)
      }
    }

    readColor();
    resize();

    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(hero);
    else window.addEventListener('resize', resize);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        heroVisible = entries[entries.length - 1].isIntersecting;
        sync();
      }).observe(hero);
    }

    document.addEventListener('visibilitychange', sync);
    onMQChange(reduceMQ, sync);
    onMQChange(window.matchMedia('(prefers-color-scheme: dark)'), function () { readColor(); draw(); });

    hero.addEventListener('pointermove', function (e) {
      if (reduceMQ.matches || e.pointerType === 'touch') return;
      var r = hero.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
    });
    hero.addEventListener('pointerleave', function () { pointer.x = pointer.y = -9999; });

    sync();
  }

  /* ------------------------------------------------------------------
     Sayaç animasyonu (data-count)
     ------------------------------------------------------------------ */
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    if (isNaN(target)) return;
    if (reduceMQ.matches) { el.textContent = target + suffix; return; }
    var dur = 1300, t0 = performance.now();
    (function tick(now) {
      var p = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * e) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  /* ------------------------------------------------------------------
     Kaydırınca görünme (stagger) + çubuk/sayaç tetikleme
     ------------------------------------------------------------------ */
  function initReveal() {
    var items = $$('.reveal');
    if (!items.length) return;

    /* her [data-stagger] kapsayıcısında çocuklara sıra numarası ver */
    $$('[data-stagger]').forEach(function (group) {
      $$('.reveal', group).forEach(function (el, i) {
        if (el.parentNode === group || el.parentNode.parentNode === group) el.style.setProperty('--i', i % 6);
      });
    });

    var animate = !reduceMQ.matches;
    var counters = $$('[data-count]');
    if (animate) counters.forEach(function (c) { c.textContent = '0' + (c.getAttribute('data-suffix') || ''); });

    function show(el) {
      el.classList.add('is-visible');
      $$('[data-count]', el).forEach(countUp);
    }

    if (!('IntersectionObserver' in window) || !animate) {
      items.forEach(show);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        show(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });

    items.forEach(function (el) { io.observe(el); });

    /* kullanıcı sonradan "azaltılmış hareket" açarsa her şeyi göster */
    onMQChange(reduceMQ, function () {
      if (reduceMQ.matches) { io.disconnect(); items.forEach(show); }
    });
  }

  /* ------------------------------------------------------------------
     Proje kartı 3B eğilme (yalnızca fare + hover cihazlar)
     ------------------------------------------------------------------ */
  function initTilt() {
    var MAX = 9;                                      // derece
    $$('[data-tilt]').forEach(function (card) {
      var frameId = 0, ev = null;

      function apply() {
        frameId = 0;
        var r = card.getBoundingClientRect();
        var px = (ev.clientX - r.left) / r.width;
        var py = (ev.clientY - r.top) / r.height;
        card.style.setProperty('--ry', ((px - 0.5) * 2 * MAX).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((0.5 - py) * 2 * MAX).toFixed(2) + 'deg');
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      }

      function reset() {
        if (frameId) { cancelAnimationFrame(frameId); frameId = 0; }
        card.classList.remove('is-tilting');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      }

      card.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse' || reduceMQ.matches || !finePointerMQ.matches) return;
        ev = e;
        card.classList.add('is-tilting');
        if (!frameId) frameId = requestAnimationFrame(apply);
      });
      card.addEventListener('pointerleave', reset);
      card.addEventListener('pointercancel', reset);
    });
  }

  /* ------------------------------------------------------------------
     Gezinme: mobil menü, aktif bağlantı, başlık gölgesi
     ------------------------------------------------------------------ */
  function initNav() {
    var header = $('#site-header');
    var toggle = $('#nav-toggle');
    var menu = $('#nav-menu');
    if (!header || !toggle || !menu) return;

    function setOpen(open, returnFocus) {
      menu.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
      if (!open && returnFocus) toggle.focus();
    }
    function isOpen() { return toggle.getAttribute('aria-expanded') === 'true'; }

    toggle.addEventListener('click', function () { setOpen(!isOpen()); });

    menu.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { setOpen(false, true); }
    });

    document.addEventListener('click', function (e) {
      if (isOpen() && !header.contains(e.target)) setOpen(false);
    });

    /* menü açıkken odak menüden tamamen çıkarsa kapat */
    header.addEventListener('focusout', function (e) {
      if (isOpen() && e.relatedTarget && !header.contains(e.relatedTarget)) setOpen(false);
    });

    /* masaüstü genişliğine dönünce sıfırla */
    onMQChange(window.matchMedia('(min-width: 801px)'), function (mq) {
      if (mq.matches) setOpen(false);
    });

    /* kaydırma izleme */
    var links = $$('.nav__link');
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var sections = $$('main > section[id]').filter(function (s) { return map[s.id]; });

    function setActive(id) {
      links.forEach(function (a) {
        var on = map[id] === a;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      });
    }

    if ('IntersectionObserver' in window) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) setActive(en.target.id); });
      }, { rootMargin: '-45% 0px -50% 0px' });
      sections.forEach(function (s) { spy.observe(s); });
    }

    /* hero görünürken aktif bağlantı yok */
    var hero = $('#hero');
    if (hero && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[entries.length - 1].isIntersecting) setActive('');
      }, { rootMargin: '-45% 0px -50% 0px' }).observe(hero);
    }

    /* kaydırınca alt çizgi (bkz. initProgress ortak scroll işleyicisi) */
    header._update = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
  }

  /* ------------------------------------------------------------------
     Kaydırma ilerleme çubuğu
     ------------------------------------------------------------------ */
  function initProgress() {
    var bar = $('#progress-bar');
    var header = $('#site-header');
    var ticking = false;

    function update() {
      ticking = false;
      var max = root.scrollHeight - root.clientHeight;
      var ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (bar) bar.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
      if (header && header._update) header._update();
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* ------------------------------------------------------------------
     E-posta kopyalama
     ------------------------------------------------------------------ */
  function initCopy() {
    var btn = $('#copy-btn');
    var status = $('#copy-status');
    if (!btn) return;
    var source = document.getElementById(btn.getAttribute('data-copy-target'));
    if (!source) return;
    var resetTimer = 0;

    function selectText() {
      var range = document.createRange();
      range.selectNodeContents(source);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function fallbackCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }

    function report(ok) {
      clearTimeout(resetTimer);
      if (ok) {
        btn.textContent = 'Kopyalandı ✓';
        if (status) status.textContent = 'E-posta adresi panoya kopyalandı.';
      } else {
        selectText();                                  // elle kopyalama için seç
        btn.textContent = 'Kopyalanamadı';
        if (status) status.textContent = 'Otomatik kopyalama çalışmadı; adres seçildi, Ctrl+C ile kopyalayabilirsin.';
      }
      resetTimer = setTimeout(function () {
        btn.textContent = 'Kopyala';
        if (status) status.textContent = '';
      }, 3000);
    }

    btn.addEventListener('click', function () {
      var text = source.textContent.trim();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { report(true); },
          function () { report(fallbackCopy(text)); }
        );
      } else {
        report(fallbackCopy(text));
      }
    });
  }

  /* ------------------------------------------------------------------ */
  function boot() {
    var yearEl = $('#year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    /* Her başlatıcı bağımsız: biri patlarsa diğerleri çalışmaya devam eder. */
    [initNav, initProgress, initTyping, initCanvas, initReveal, initTilt, initCopy].forEach(function (fn) {
      try { fn(); } catch (err) {
        if (window.console && console.warn) console.warn('[portfolyo] ' + fn.name + ' başlatılamadı:', err);
        if (fn === initReveal) {                        // içerik gizli kalmasın
          root.classList.remove('js');
        }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
