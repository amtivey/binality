/* Binality platform shim. No imports; load before js/index.js.
 *
 * window.BinalityPlatform = { isNative, platform, share, saveFile, openExternal,
 *                             keepAlive: { start, stop }, prefs: { get, set } }
 *
 * isNative/platform come from window.Capacitor (injected by the native shell).
 * On the web every wrapper falls back to a web API or a no-op, so the site
 * behaves exactly as before. Native plugin wiring is added in later cards.
 */
(function () {
  'use strict';

  var cap = window.Capacitor;
  var isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  var platform = cap && typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web';

  function resolved(v) {
    return Promise.resolve(v);
  }

  function plugin(name) {
    return cap && cap.Plugins ? cap.Plugins[name] : undefined;
  }

  function share(opts) {
    opts = opts || {};
    var p = plugin('Share');
    if (isNative && p && p.share) return p.share(opts);
    if (navigator.share) return navigator.share(opts);
    return resolved(false);
  }

  // saveFile(name, blob|string, mimeType): web fallback is a download link.
  function saveFile(name, data, mimeType) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    return resolved(true);
  }

  function openExternal(url) {
    var p = plugin('Browser');
    if (isNative && p && p.open) return p.open({ url: url });
    window.open(url, '_blank', 'noopener');
    return resolved(true);
  }

  var keepAlive = {
    start: function () {
      return resolved(false);
    },
    stop: function () {
      return resolved(false);
    }
  };

  var prefs = {
    get: function (key) {
      try {
        return resolved(window.localStorage.getItem(key));
      } catch (e) {
        return resolved(null);
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        /* ignore */
      }
      return resolved();
    }
  };

  window.BinalityPlatform = {
    isNative: isNative,
    platform: platform,
    share: share,
    saveFile: saveFile,
    openExternal: openExternal,
    keepAlive: keepAlive,
    prefs: prefs
  };

  // Lets CSS hide PWA-only UI (install button, update toast, offline-PWA copy).
  if (isNative) document.documentElement.classList.add('native-app');
})();
