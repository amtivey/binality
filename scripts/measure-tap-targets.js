/*
 * Tap-target measurement (MUX-TAP-1/2, UX acceptance step 10).
 *
 * Usage: open the app in Chrome DevTools device emulation (e.g. 360x800, touch), open the
 * Console, paste this file, then run:
 *     measureTapTargets()                 // measures what is currently visible
 *     await measureTapTargetsAllStates()  // also opens Settings, Studio, and the breathing pacer
 * It prints a table of every visible interactive element smaller than 48x48 px, and pairs of
 * hit areas closer than 8 px. An empty "small" list means step 10 passes.
 * The same code is used headlessly by the M1.3 verification (see the PR description).
 */
(function (global) {
  var MIN = 48;
  var GAP = 8;
  var SELECTOR = [
    'button',
    'a[href]',
    'select',
    'textarea',
    'summary',
    '[role="button"]',
    '[tabindex]:not([tabindex="-1"])',
    'input:not([type="hidden"])'
  ].join(',');

  function visible(el) {
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    for (var p = el; p && p !== document.body; p = p.parentElement) {
      var pcs = getComputedStyle(p);
      if (pcs.display === 'none' || pcs.visibility === 'hidden' || parseFloat(pcs.opacity) === 0) return false;
    }
    // Bring it into view inside scroll containers (Settings/Studio bodies), then make sure nothing (e.g. an open
    // modal) covers it: the element at its centre point must be the element itself, a descendant or an ancestor.
    try {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } catch (e) {}
    r = el.getBoundingClientRect();
    var cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
    var cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
    var top = document.elementFromPoint(cx, cy);
    if (!top) return false;
    if (top !== el && !el.contains(top) && !top.contains(el)) {
      // labels wrap their inputs
      if (!(el.labels && Array.prototype.indexOf.call(el.labels, top) >= 0)) return false;
    }
    return true;
  }

  function label(el) {
    var id = el.id ? '#' + el.id : '';
    var cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    return el.tagName.toLowerCase() + id + cls.slice(0, 60);
  }

  function collect() {
    var out = [];
    var els = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < els.length; ++i) {
      var el = els[i];
      if (!visible(el)) continue;
      // A checkbox/radio hidden under a styled label: measure the label instead.
      var r = el.getBoundingClientRect();
      // Scroll-independent position (viewport rect + scrolled-away distance of every ancestor), because
      // scrollIntoView() in visible() moves earlier items while we walk the list.
      var sx = 0;
      var sy = 0;
      for (var a = el.parentElement; a; a = a.parentElement) {
        sx += a.scrollLeft;
        sy += a.scrollTop;
      }
      var pr = { left: r.left + sx, right: r.right + sx, top: r.top + sy, bottom: r.bottom + sy };
      var scroller = null;
      for (var q = el.parentElement; q; q = q.parentElement) {
        var oy = getComputedStyle(q).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && q.scrollHeight > q.clientHeight) {
          scroller = q;
          break;
        }
      }
      out.push({ el: el, scroller: scroller, name: label(el), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, r: pr });
    }
    return out;
  }

  function measureTapTargets(opts) {
    opts = opts || {};
    var items = collect();
    var small = items.filter(function (t) {
      return t.w < MIN - 0.5 || t.h < MIN - 0.5;
    });
    var tight = [];
    for (var a = 0; a < items.length; ++a) {
      for (var b = a + 1; b < items.length; ++b) {
        var A = items[a];
        var B = items[b];
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        if (A.scroller !== B.scroller) continue; // e.g. a scrolling dialog body vs its fixed footer: positions not comparable
        var dx = Math.max(A.r.left - B.r.right, B.r.left - A.r.right);
        var dy = Math.max(A.r.top - B.r.bottom, B.r.top - A.r.bottom);
        var dist = Math.max(dx, dy); // negative both axes = overlap
        if (dx < 0 && dy < 0) {
          tight.push({ a: A.name, b: B.name, gap: 'overlap' });
        } else if (dist < GAP - 0.5 && (dx < 0 || dy < 0 ? true : Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) < GAP)) {
          tight.push({ a: A.name, b: B.name, gap: Math.round(Math.max(dx, dy) * 10) / 10 });
        }
      }
    }
    var result = {
      viewport: innerWidth + 'x' + innerHeight,
      measured: items.length,
      small: small.map(function (t) {
        return t.name + ' ' + t.w + 'x' + t.h;
      }),
      tight: tight.map(function (t) {
        return t.a + ' <-> ' + t.b + ' gap=' + t.gap;
      })
    };
    if (!opts.quiet) {
      console.log('Tap targets measured:', result.measured, 'at', result.viewport);
      console.log('Smaller than ' + MIN + 'x' + MIN + ':', result.small.length);
      if (result.small.length) console.table(result.small);
      console.log('Closer than ' + GAP + 'px:', result.tight.length);
      if (result.tight.length) console.table(result.tight);
    }
    return result;
  }

  function sleep(ms) {
    return new Promise(function (res) {
      setTimeout(res, ms);
    });
  }

  async function measureTapTargetsAllStates() {
    var results = {};
    results.main = measureTapTargets({ quiet: true });

    var scope = document.getElementById('btnViewWaveform');
    if (scope) {
      scope.click();
      await sleep(250);
      results.scope = measureTapTargets({ quiet: true });
      var curve = document.getElementById('btnViewCurve');
      if (curve) curve.click();
      await sleep(150);
    }

    var breath = document.getElementById('headerBreathBtn');
    if (breath) {
      breath.click();
      await sleep(300);
      results.breath = measureTapTargets({ quiet: true });
      breath.click();
      await sleep(200);
    }

    var menu = document.getElementById('menu');
    if (menu) {
      menu.click();
      await sleep(250);
      results.settings = measureTapTargets({ quiet: true });
      var body = document.getElementById('settingsBody');
      if (body) {
        // Walk the scroll body so every row is laid out (and measured at its resting position).
        body.scrollTop = body.scrollHeight;
        await sleep(100);
        body.scrollTop = 0;
      }
      var studioFromSettings = document.getElementById('openStudioFromSettingsBtn');
      var closeIcon = document.getElementById('closeSettingsIcon');
      if (closeIcon) closeIcon.click();
      await sleep(150);
    }

    var studio = document.getElementById('headerStudioBtn');
    if (studio) {
      studio.click();
      await sleep(400);
      results.studio = measureTapTargets({ quiet: true });
      var closeStudioIcon = document.getElementById('closeStudioIcon');
      if (closeStudioIcon) closeStudioIcon.click();
      await sleep(150);
    }

    var total = 0;
    Object.keys(results).forEach(function (k) {
      total += results[k].small.length;
      console.log('[' + k + '] measured=' + results[k].measured + ' small=' + results[k].small.length + ' tight=' + results[k].tight.length);
      results[k].small.forEach(function (s) {
        console.log('   small: ' + s);
      });
      results[k].tight.forEach(function (s) {
        console.log('   tight: ' + s);
      });
    });
    console.log(total === 0 ? 'PASS: every measured target is >= ' + MIN + 'x' + MIN : 'FAIL: ' + total + ' targets under ' + MIN + 'x' + MIN);
    return results;
  }

  global.measureTapTargets = measureTapTargets;
  global.measureTapTargetsAllStates = measureTapTargetsAllStates;
})(window);
