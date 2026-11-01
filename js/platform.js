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

  // keepAlive: Android foreground service + wake lock so audio survives screen-off (D7).
  // Native Android only; a no-op everywhere else (web, iOS: handled by later cards).
  // start(title) is safe to call repeatedly. onStopRequested(fn) is invoked when the user taps
  // Stop in the playback notification; the app must run its normal stop() path from it.
  var NOTIF_ASKED_KEY = 'binality.notifPermissionAsked';
  var stopHandler = null;
  var stopListenerAdded = false;
  var wantKeepAlive = false; // guards against a slow permission flow starting the service after stop()
  var keepAliveActive = platform === 'android';

  function fgPlugin() {
    return keepAliveActive && isNative ? plugin('ForegroundAudio') : undefined;
  }

  // Android 13+: explain once, then ask. A denial is final for our purposes and never blocks playback.
  function ensureNotificationPermission(p) {
    return p
      .checkNotificationPermission()
      .then(function (r) {
        if (r && r.granted) return;
        try {
          if (window.localStorage.getItem(NOTIF_ASKED_KEY)) return;
          window.localStorage.setItem(NOTIF_ASKED_KEY, '1');
        } catch (e) {
          /* storage unavailable: fall through and ask once per call */
        }
        var ok = window.confirm(
          'Binality shows a notification while a session plays, with a Stop button, ' +
            'so audio keeps running when your screen is off. Allow notifications on the next prompt.\n\n' +
            'If you decline, playback still works; you just will not see the notification.'
        );
        if (!ok) return;
        return p.requestNotificationPermission();
      })
      .catch(function () {
        /* permission flow must never block playback */
      });
  }

  var keepAlive = {
    start: function (title) {
      var p = fgPlugin();
      if (!p) return resolved(false);
      wantKeepAlive = true;
      if (!stopListenerAdded && p.addListener) {
        stopListenerAdded = true;
        p.addListener('stopRequested', function () {
          if (stopHandler) stopHandler();
        });
      }
      return ensureNotificationPermission(p).then(function () {
        if (!wantKeepAlive) return false;
        return p.start({ title: title || '' }).then(
          function () {
            return true;
          },
          function () {
            return false;
          }
        );
      });
    },
    stop: function () {
      var p = fgPlugin();
      wantKeepAlive = false;
      if (!p) return resolved(false);
      return p.stop().then(
        function () {
          return true;
        },
        function () {
          return false;
        }
      );
    },
    onStopRequested: function (fn) {
      stopHandler = fn;
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
