#!/usr/bin/env python3
"""M1.6 UX QA driver (QA harness, not shipped).

Runs inside reactivecircus/android-emulator-runner. Drives the Capacitor debug APK through
UX section 11 steps 1, 5, 6, 9, 10, 12 using
  - native input (adb input tap/swipe, settings put system user_rotation/font_scale, wm size/density),
  - the WebView DevTools socket (read-only probes of layout/audio state),
  - adb screencap and uiautomator dumps.
Usage: m16_driver.py <apk> <out-dir> <profiles e.g. A,F,G,H> <tag>
Writes <out-dir>/results.json and PNGs.
"""
import json, os, re, subprocess, sys, time, urllib.request, xml.etree.ElementTree as ET

APK, OUT, PROFILES, TAG = sys.argv[1], sys.argv[2], sys.argv[3].split(','), sys.argv[4]
PKG = 'com.virtualarenas.binality.dev'
ACT = PKG.replace('.dev', '') + '.MainActivity'
os.makedirs(OUT, exist_ok=True)

# id: (css width, css height, dpr)  portrait
PROF = {
    'A': (412, 915, 2.625),    # Pixel 6a-like, native size of the AVD
    'B': (360, 760, 2.0),      # low-end 3-button
    'F': (800, 1280, 2.0),     # tablet
    'G': (673, 841, 2.0),      # foldable unfolded
    'H': (320, 480, 2.0),      # split-screen worst case
}
RES = []


def sh(cmd, check=False, timeout=60):
    r = subprocess.run(['adb', 'shell', cmd], capture_output=True, text=True, timeout=timeout)
    if check and r.returncode:
        raise RuntimeError(cmd + ': ' + r.stderr)
    return (r.stdout or '').strip()


def adb(*a, timeout=120):
    return subprocess.run(['adb'] + list(a), capture_output=True, timeout=timeout)


def rec(step, dev, cond, status, detail='', mux=''):
    RES.append(dict(step=step, device=dev, cond=cond, status=status, detail=str(detail)[:1600], mux=mux))
    print('[%s] step%s %s %s: %s %s' % (status, step, dev, cond, mux, str(detail)[:300]), flush=True)
    json.dump(RES, open(os.path.join(OUT, 'results.json'), 'w'), indent=1)


def check(step, dev, cond, ok, detail='', mux=''):
    rec(step, dev, cond, 'PASS' if ok else 'FAIL', detail, mux)
    return ok


def shot(name):
    p = os.path.join(OUT, name + '.png')
    open(p, 'wb').write(adb('exec-out', 'screencap', '-p').stdout)
    return p


# ---------------------------------------------------------------- display / app control
def rot_lock(r):
    out = sh('wm user-rotation lock %d' % r)
    if 'rror' in out or 'nknown' in out:
        sh('settings put system accelerometer_rotation 0; settings put system user_rotation %d' % r)


def set_profile(dev, landscape=False):
    w, h, dpr = PROF[dev]
    dens = int(round(dpr * 160))
    if dev == 'A':
        sh('wm size reset; wm density reset')
    else:
        sh('wm size %dx%d; wm density %d' % (int(w * dpr), int(h * dpr), dens))
    rot_lock(1 if landscape else 0)
    time.sleep(2)


def rotate(r):
    rot_lock(r)


def ensure_orient(dev, landscape):
    for _ in range(3):
        d = ev('[innerWidth, innerHeight]')
        if (d[0] > d[1]) == landscape:
            return True
        rot_lock(1 if landscape else 0); time.sleep(2.5)
        launch(); time.sleep(3); ack_notice(dev)
    rec('harness', dev, 'could not force orientation landscape=%s' % landscape, 'ERROR', ev('[innerWidth, innerHeight]'))
    return False


def launch(clear=False):
    sh('am force-stop ' + PKG)
    if clear:
        sh('pm clear ' + PKG)
    sh('am start -W -n %s/%s' % (PKG, ACT))
    t0 = time.time()
    while time.time() - t0 < 40:
        try:
            if cdp_connect():
                return True
        except Exception as e:  # noqa
            pass
        time.sleep(1)
    return False


# ---------------------------------------------------------------- CDP over the WebView socket
import websocket  # noqa: E402  (pip install websocket-client)

WS = None
_id = 0


def cdp_connect():
    global WS
    pid = sh('pidof ' + PKG).split()
    if not pid:
        return False
    socks = sh('cat /proc/net/unix | grep webview_devtools_remote_%s' % pid[0])
    m = re.search(r'@(webview_devtools_remote_\d+)', socks)
    if not m:
        return False
    adb('forward', 'tcp:9222', 'localabstract:' + m.group(1))
    tg = json.loads(urllib.request.urlopen('http://localhost:9222/json', timeout=5).read())
    pages = [t for t in tg if t.get('type') == 'page']
    if not pages:
        return False
    if WS:
        try: WS.close()
        except Exception: pass
    WS = websocket.create_connection(pages[0]['webSocketDebuggerUrl'], timeout=20, suppress_origin=True)
    ready = ev('document.readyState')
    return ready in ('interactive', 'complete')


def ev(expr, retry=True):
    global _id
    for attempt in range(2):
        try:
            _id += 1
            WS.send(json.dumps({'id': _id, 'method': 'Runtime.evaluate',
                                'params': {'expression': expr, 'returnByValue': True, 'awaitPromise': True}}))
            while True:
                m = json.loads(WS.recv())
                if m.get('id') == _id:
                    break
            r = m.get('result', {})
            if 'exceptionDetails' in r:
                raise RuntimeError(json.dumps(r['exceptionDetails'])[:300])
            return r.get('result', {}).get('value')
        except (websocket.WebSocketException, ConnectionError, OSError):
            if attempt or not retry:
                raise
            cdp_connect()


# ---------------------------------------------------------------- native input
def webview_bounds():
    """Screen-pixel bounds of the WebView from a uiautomator dump."""
    sh('uiautomator dump /sdcard/ui.xml >/dev/null 2>&1')
    x = adb('exec-out', 'cat', '/sdcard/ui.xml').stdout.decode('utf8', 'ignore')
    try:
        root = ET.fromstring(x)
    except ET.ParseError:
        return None, x
    for n in root.iter('node'):
        if n.get('class') == 'android.webkit.WebView':
            b = list(map(int, re.findall(r'\d+', n.get('bounds'))))
            return b, x
    return None, x


def screen_scale():
    w, h, dpr = PROF[CUR['dev']]
    return float(ev('devicePixelRatio')) * (float(ev('1')) if False else 1)


CUR = {'dev': 'A'}


def native_tap_css(cx, cy):
    b, _ = webview_bounds()
    d = float(ev('devicePixelRatio'))
    # DPR in WebView == screen density / 160 (textZoom does not change it)
    px = (b[0] if b else 0) + cx * d
    py = (b[1] if b else 0) + cy * d
    sh('input tap %d %d' % (px, py))


def center(selector):
    return ev('(()=>{const e=document.querySelector(%s); if(!e) return null; const r=e.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2, r.width, r.height]})()' % json.dumps(selector))


def tap(selector):
    c = center(selector)
    if not c:
        return False
    native_tap_css(c[0], c[1])
    time.sleep(0.6)
    return True


# ---------------------------------------------------------------- page probes
PROBE = r"""
(() => {
  const out = {};
  const de = document.documentElement, vw = innerWidth, vh = innerHeight;
  out.vw = vw; out.vh = vh; out.dpr = devicePixelRatio;
  out.hscroll = Math.max(de.scrollWidth, document.body.scrollWidth) - vw;
  out.vscroll = Math.max(de.scrollHeight, document.body.scrollHeight) - vh;
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:var(--sat) var(--sar) var(--sab) var(--sal);width:0;height:0';
  document.body.appendChild(p);
  const cs = getComputedStyle(p);
  const ins = {t: parseFloat(cs.paddingTop)||0, r: parseFloat(cs.paddingRight)||0, b: parseFloat(cs.paddingBottom)||0, l: parseFloat(cs.paddingLeft)||0};
  p.remove(); out.ins = ins;
  out.nativeCls = de.classList.contains('native-app');
  out.platform = window.BinalityPlatform && BinalityPlatform.platform;
  const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null;
    for (let n = e; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || n.hidden || parseFloat(s.opacity) < 0.05) return null; }
    return r; };
  const sel = 'button, a[href], input:not([type=hidden]), select, summary, [role=button], [role=tab], [role=switch], textarea';
  const tap = [];
  document.querySelectorAll(sel).forEach(e => { const r = vis(e); if (!r) return;
    let inView = r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
    if (inView) { const cxp = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1), cyp = Math.min(Math.max(r.top + r.height / 2, 1), vh - 1);
      const top = document.elementFromPoint(cxp, cyp); if (top && !(e.contains(top) || top.contains(e) || (e.labels && Array.from(e.labels).some(l => l.contains(top))))) inView = false; }
    tap.push({id: e.id || e.className.toString().slice(0, 30) || e.tagName, tag: e.tagName, w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), inView, txt: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24)}); });
  const small = tap.filter(x => x.inView && (x.w < 47.5 || x.h < 47.5) && !(x.tag === 'INPUT' && /checkbox|radio|file/.test(document.getElementById(x.id) ? document.getElementById(x.id).type : '')));
  out.nTap = tap.length; out.small = small.slice(0, 25);
  const clipped = tap.filter(x => x.inView && (x.l < ins.l - 0.5 || x.r > vw - ins.r + 0.5 || x.t < ins.t - 0.5));
  out.inInset = clipped.slice(0, 15);
  const overl = [];
  const vt = tap.filter(x => x.inView && x.tag !== 'LABEL');
  for (let i = 0; i < vt.length; i++) for (let j = i + 1; j < vt.length; j++) {
    const a = vt[i], b = vt[j]; const ix = Math.min(a.r, b.r) - Math.max(a.l, b.l), iy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    const nest = (a.l <= b.l && a.r >= b.r && a.t <= b.t && a.b >= b.b) || (b.l <= a.l && b.r >= a.r && b.t <= a.t && b.b >= a.b);
    if (ix > 2 && iy > 2 && !nest) overl.push([a.id || a.txt, b.id || b.txt, +ix.toFixed(0), +iy.toFixed(0)]); }
  out.overlap = overl.slice(0, 10);
  const gaps = [];
  for (let i = 0; i < vt.length; i++) for (let j = i + 1; j < vt.length; j++) {
    const a = vt[i], b = vt[j];
    const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    let g = null;
    if (oy > 8 && ox <= 0) g = -ox; else if (ox > 8 && oy <= 0) g = -oy;
    if (g !== null && g < 7.5 && g >= 0) gaps.push([a.id || a.txt, b.id || b.txt, +g.toFixed(1)]); }
  out.tightGaps = gaps.slice(0, 10);
  const st = document.getElementById('start'); const sr = st && vis(st);
  out.start = sr ? {l: sr.left, t: sr.top, r: sr.right, b: sr.bottom, w: sr.width, h: sr.height, gapBottom: vh - sr.bottom - ins.b, gapLeft: sr.left - ins.l, gapRight: vw - sr.right - ins.r} : null;
  const h = document.getElementById('header'); const hr = h && vis(h);
  out.header = hr ? {h: hr.height, w: hr.width, sw: h.scrollWidth, cw: h.clientWidth, t: hr.top} : null;
  const tiny = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) { if (!n.nodeValue.trim()) continue; const e = n.parentElement; if (!e || !vis(e)) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 10.95 && !e.closest('canvas,svg')) tiny.push([e.id || e.className.toString().slice(0, 24), fs, n.nodeValue.trim().slice(0, 16)]); }
  out.tinyText = tiny.slice(0, 10);
  const open = id => { const e = document.getElementById(id); if (!e) return false; const s = getComputedStyle(e); return s.display !== 'none' && !e.hidden && s.visibility !== 'hidden'; };
  out.open = {settings: open('settings'), studio: open('studioModal'), notice: open('noticeModal'), program: open('programSheet'), info: open('infoSheet'), breath: open('breathOverlay')};
  const sl = document.getElementById('slider'); out.slider = sl ? +sl.value : null;
  out.ctx = window.context ? {state: context.state, t: context.currentTime} : null;
  out.status = (document.getElementById('audioStatus') || {}).dataset ? document.getElementById('audioStatus').dataset.state : null;
  out.t0 = performance.timeOrigin;
  const ch = document.getElementById('chart'); const cr = ch && vis(ch); out.stage = cr ? {w: cr.width, h: cr.height, t: cr.top, b: cr.bottom} : null;
  const ext = performance.getEntriesByType('resource').map(r => r.name).filter(u => { try { return new URL(u).hostname !== 'localhost'; } catch (e) { return false; } });
  out.external = ext.slice(0, 5);
  out.fonts = ['Outfit', 'Plus Jakarta Sans', 'JetBrains Mono'].map(f => f + ':' + document.fonts.check('16px "' + f + '"'));
  out.docFonts = Array.from(document.fonts).filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i);
  return out;
})()
"""


def probe():
    return ev(PROBE)


def uia_small():
    """Clickable accessibility nodes smaller than 48 dp (uiautomator = Accessibility-Scanner-like view)."""
    b, x = webview_bounds()
    try:
        root = ET.fromstring(x)
    except ET.ParseError:
        return None
    d = float(ev('devicePixelRatio'))
    bad, total = [], 0
    for n in root.iter('node'):
        if n.get('clickable') == 'true' and n.get('package') == PKG:
            bb = list(map(int, re.findall(r'\d+', n.get('bounds'))))
            w, h = (bb[2] - bb[0]) / d, (bb[3] - bb[1]) / d
            if n.get('class') == 'android.webkit.WebView':
                continue
            total += 1
            if w < 47.5 or h < 47.5:
                bad.append('%s|%s|%.0fx%.0f' % ((n.get('content-desc') or n.get('text') or n.get('resource-id') or n.get('class'))[:24], n.get('class').split('.')[-1], w, h))
    return total, bad


def ack_notice(dev):
    for _ in range(3):
        if probe()['open']['notice']:
            tap('#noticeAckBtn')
        else:
            return True
        time.sleep(0.5)
    return not probe()['open']['notice']


def dismiss_all():
    for sel, ok in (('#closeSettingsIcon', 'settings'), ('#closeStudioIcon', 'studio')):
        if probe()['open'][ok]:
            tap(sel)


# ---------------------------------------------------------------- the checks
def layout_checks(step, dev, cond, p, expect_start=True):
    """Common layout assertions (MUX-LAYOUT-1/4, SAFE-3, TAP-1/2/3, HUD-1, LAYOUT-7)."""
    ok = True
    ok &= check(step, dev, cond + ' no horizontal scroll', p['hscroll'] <= 1, 'overflow x=%s' % p['hscroll'], 'MUX-LAYOUT-1/4')
    ok &= check(step, dev, cond + ' no vertical page scroll', p['vscroll'] <= 1, 'overflow y=%s' % p['vscroll'], 'MUX-LAYOUT-1')
    s = p['start']
    if expect_start:
        ok &= check(step, dev, cond + ' Start visible in viewport', bool(s) and s['b'] <= p['vh'] + 0.5 and s['t'] >= 0, s, 'MUX-LAYOUT-1')
        if s:
            ok &= check(step, dev, cond + ' Start >=8px above bottom inset', s['gapBottom'] >= 7.5, 'gap=%.1f ins=%s' % (s['gapBottom'], p['ins']), 'MUX-SAFE-3')
            ok &= check(step, dev, cond + ' Start height >=56', s['h'] >= 55.5, 'h=%.1f' % s['h'], 'MUX-TAP-3')
    ok &= check(step, dev, cond + ' tap targets >=48x48 (DOM)', not p['small'], p['small'][:6], 'MUX-TAP-1')
    ok &= check(step, dev, cond + ' no overlapping tap targets', not p['overlap'], p['overlap'][:4], 'MUX-LAYOUT-4')
    ok &= check(step, dev, cond + ' >=8px between tap targets', not p['tightGaps'], p['tightGaps'][:6], 'MUX-TAP-2')
    ok &= check(step, dev, cond + ' controls clear of insets', not p['inInset'], 'ins=%s %s' % (p['ins'], p['inInset'][:4]), 'MUX-SAFE-1..4')
    ok &= check(step, dev, cond + ' no text <11px', not p['tinyText'], p['tinyText'][:5], 'MUX-LAYOUT-7')
    return ok


def run_profile(dev):
    CUR['dev'] = dev
    w, h, dpr = PROF[dev]
    sh('settings put system font_scale 1.0')
    set_profile(dev)
    # ---- step 1: fresh install, airplane mode
    adb('install', '-r', '-g', APK)
    sh('cmd connectivity airplane-mode enable || (settings put global airplane_mode_on 1; am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true)')
    sh('pm clear ' + PKG)
    if not launch(clear=True):
        rec(1, dev, 'launch', 'FAIL', 'WebView DevTools socket not reachable / app crashed', 'MUX-NATIVE-2')
        shot('%s_launch_fail' % dev)
        return
    time.sleep(2.5)
    p = probe()
    check(1, dev, 'first-run notice shown on fresh install', p['open']['notice'], p['open'], 'MUX-LIFE-10')
    check(1, dev, 'native shell detected (BinalityPlatform.isNative / .native-app)', p['nativeCls'], 'platform=%s' % p['platform'], 'MUX-NATIVE-3')
    wv = ev('navigator.userAgent')
    rec(1, dev, 'info: WebView user agent', 'INFO', wv, '')
    open(os.path.join(OUT, '%s_webview.txt' % dev), 'w').write(str(wv) + '\n' + sh('dumpsys webviewupdate | head -30'))
    opts = ev("Array.from(document.querySelectorAll('#quickTimerSelect option, #timerSelect option')).map(o=>o.textContent.trim())")
    check(1, dev, 'timer options do not include the 10 s test entry (native)', not any('10s' in (o or '').replace(' ', '') or 'Test' in (o or '') for o in opts), opts, 'D21')
    pwa = ev("(()=>{const v=id=>{const e=document.getElementById(id);return e?getComputedStyle(e).display:'absent'};return [v('pwaUpdateToast'),v('pwaInstallBtn'),Array.from(document.querySelectorAll('.pwa-settings-card')).map(e=>getComputedStyle(e).display)]})()")
    check(1, dev, 'PWA-only UI suppressed in native shell', pwa[0] in ('none', 'absent') and pwa[1] in ('none', 'absent') and all(x == 'none' for x in pwa[2]), pwa, 'MUX-NATIVE-3')
    shot('%s_p_notice' % dev)
    check(1, dev, 'fonts local (no non-localhost requests, 3 families loaded)', not p['external'] and all(f.endswith('true') for f in p['fonts']) , '%s ext=%s docFonts=%s' % (p['fonts'], p['external'], p['docFonts']), 'MUX-VIS-4')
    # notice fits: ack button within viewport
    nb = ev("(()=>{const b=document.getElementById('noticeAckBtn');const r=b&&b.getBoundingClientRect();return r?[r.top,r.bottom,r.height,innerHeight]:null})()")
    check(1, dev, 'notice acknowledge button reachable in viewport', bool(nb) and nb[1] <= nb[3] + 0.5 and nb[2] >= 47.5, nb, 'MUX-LIFE-10')
    ok = ack_notice(dev)
    check(1, dev, 'notice acknowledged via native tap, dismissed', ok, '', 'MUX-LIFE-10')
    time.sleep(1)
    p = probe()
    shot('%s_p_idle' % dev)
    layout_checks(1, dev, 'portrait idle', p)
    hud_table(dev, 'portrait compact idle')
    slider_test(dev)
    check(1, dev, 'status idle, no autoplay', p['status'] in ('idle', None) and (not p['ctx'] or p['ctx']['state'] != 'running'), '%s %s' % (p['status'], p['ctx']), 'MUX-LIFE-7')
    # relaunch: notice must not return
    launch(); time.sleep(2.5)
    p = probe()
    check(1, dev, 'notice not re-shown after relaunch', not p['open']['notice'], '', 'MUX-LIFE-10')
    sh('cmd connectivity airplane-mode disable || (settings put global airplane_mode_on 0; am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false)')

    # ---- step 10 + layouts: portrait states
    if tap('#menu'):
        time.sleep(1)
        p = probe()
        shot('%s_p_settings' % dev)
        check(10, dev, 'Settings opens full-screen sheet', p['open']['settings'], '', 'MUX-LAYOUT-6')
        sd = ev("(()=>{const e=document.querySelector('#settings .settings-dialog');const r=e.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom,innerWidth,innerHeight]})()")
        if innerless(dev):
            check(10, dev, 'Settings sheet fills width/height (Compact)', sd[0] <= 1 and sd[2] >= sd[4] - 1 and sd[3] >= sd[5] - 1, sd, 'MUX-LAYOUT-6')
        layout_checks(10, dev, 'portrait settings open', p, expect_start=False)
        u = uia_small()
        if u:
            check(10, dev, 'uiautomator: clickable nodes >=48dp (settings open) [%d nodes]' % u[0], not u[1], u[1][:8], 'MUX-TAP-1')
        # settings body scroll, close, done within safe area
        cl = center('#closeSettingsIcon')
        check(10, dev, 'Settings close button >=48 and in viewport', bool(cl) and cl[2] >= 47.5 and cl[3] >= 47.5 and cl[1] > 0, cl, 'MUX-IN-5')
        dn = ev("(()=>{const b=document.getElementById('done');const r=b.getBoundingClientRect();return [r.top,r.bottom,r.height,innerHeight]})()")
        p2 = probe()
        check(12, dev, 'Settings Done clears bottom inset', dn[1] <= dn[3] - p2['ins']['b'] + 0.5, '%s ins.b=%s' % (dn, p2['ins']['b']), 'MUX-SAFE-3')
        tap('#closeSettingsIcon'); time.sleep(0.6)
    uia = uia_small()
    if uia:
        check(10, dev, 'uiautomator: clickable nodes >=48dp (main portrait) [%d nodes]' % uia[0], not uia[1], uia[1][:8], 'MUX-TAP-1')
    for sel, key, nm in (('#title', 'program', 'program sheet'),):
        if tap(sel):
            time.sleep(0.8); p = probe(); shot('%s_p_%s' % (dev, key))
            check(10, dev, nm + ' opens by tapping title', p['open'][key], '', 'MUX-IN-7')
            layout_checks(10, dev, 'portrait ' + nm, p, expect_start=False)
            sheet = ev("(()=>{const s=document.getElementById('programSheet');const pn=s.querySelector('.sheet-panel');const pr=pn.getBoundingClientRect();const cl=s.querySelector('.close-icon-btn, [data-sheet-close].close-icon-btn, button[aria-label*=Close i]');const cr=cl&&cl.getBoundingClientRect();const rows=Array.from(s.querySelectorAll('.program-row')).map(r=>Math.round(r.getBoundingClientRect().right));return {panel:[Math.round(pr.left),Math.round(pr.right)],vw:innerWidth,close:cr?[Math.round(cr.left),Math.round(cr.right),Math.round(cr.width),Math.round(cr.height)]:null,maxRowRight:Math.max.apply(null,rows),rows:rows.length,panelScrollW:pn.scrollWidth,panelClientW:pn.clientWidth}})()")
            check(10, dev, nm + ' panel and rows fit the window width, close button inside viewport', bool(sheet) and sheet['panel'][1] <= sheet['vw'] + 1 and sheet['maxRowRight'] <= sheet['vw'] + 1 and bool(sheet['close']) and sheet['close'][1] <= sheet['vw'] and sheet['close'][2] >= 47.5 and sheet['close'][3] >= 47.5, sheet, 'MUX-IN-5 / MUX-LAYOUT-4')
            tap('#programSheet [data-sheet-close]') if False else None
            ev("document.querySelector('#programSheet [data-sheet-close]') && document.querySelector('#programSheet [data-sheet-close]').click()")
            time.sleep(0.5)

    # ---- step 6 and 5 need a playing session
    ev("window.__osc=0; (function(){const o=AudioContext.prototype.createOscillator; AudioContext.prototype.createOscillator=function(){window.__osc++; return o.apply(this,arguments)}})(); true")
    tap('#start'); time.sleep(4)
    p = probe()
    check(6, dev, 'Start via native tap begins playback (ctx running, status playing)', bool(p['ctx']) and p['ctx']['state'] == 'running', '%s %s' % (p['ctx'], p['status']), 'MUX-LIFE-5')
    shot('%s_p_playing' % dev)
    layout_checks(1, dev, 'portrait playing', p)
    step6(dev, 0.0, '[finger mid-stage] ')
    step6(dev, 0.3, '[finger lower stage] ')
    step5(dev)
    # stop
    tap('#start'); time.sleep(1.5)

    # ---- landscape
    set_profile(dev, landscape=True)
    launch(); time.sleep(2.5); ensure_orient(dev, True)
    ack_notice(dev)
    p = probe()
    shot('%s_l_idle' % dev)
    hud_table(dev, 'landscape idle')
    short = p['vh'] < 500
    layout_checks(12, dev, 'landscape idle (%dx%d%s)' % (p['vw'], p['vh'], ' short' if short else ''), p)
    if short:
        check(12, dev, 'short landscape header <=48px', p['header'] and p['header']['h'] <= 48.5, p['header'], 'MUX-HUD / sketch B')
    ev("window.__osc=0")
    if tap('#menu'):
        time.sleep(1); p = probe(); shot('%s_l_settings' % dev)
        layout_checks(10, dev, 'landscape settings open', p, expect_start=False)
        u = uia_small()
        if u:
            check(10, dev, 'uiautomator: clickable >=48dp (landscape settings) [%d]' % u[0], not u[1], u[1][:8], 'MUX-TAP-1')
        tap('#closeSettingsIcon'); time.sleep(0.5)
    u = uia_small()
    if u:
        check(10, dev, 'uiautomator: clickable >=48dp (landscape main) [%d]' % u[0], not u[1], u[1][:8], 'MUX-TAP-1')
    # scope view in landscape
    if tap('#btnViewWaveform'):
        time.sleep(1); p = probe(); shot('%s_l_scope' % dev)
        layout_checks(12, dev, 'landscape scope view', p)
        tap('#btnViewCurve')

    # ---- step 9: font scale 200%
    for ls in (False, True):
        sh('settings put system font_scale 2.0'); time.sleep(1)
        set_profile(dev, landscape=ls)
        time.sleep(1)
        launch(); time.sleep(3); ack_notice(dev); ensure_orient(dev, ls)
        ack_notice(dev)
        p = probe()
        cond = 'font 200%% %s' % ('landscape' if ls else 'portrait')
        shot('%s_%s_font200' % (dev, 'l' if ls else 'p'))
        s = p['start']
        check(9, dev, cond + ' Start visible', bool(s) and s['b'] <= p['vh'] + 0.5 and s['t'] >= 0 and s['h'] >= 40, s, 'MUX-LAYOUT-7')
        check(9, dev, cond + ' no horizontal scroll', p['hscroll'] <= 1, p['hscroll'], 'MUX-LAYOUT-7')
        sl = center('#slider')
        slvis = bool(sl) and sl[1] + sl[3] / 2 <= p['vh'] and sl[1] >= 0
        check(9, dev, cond + ' time slider visible', slvis, sl, 'MUX-LAYOUT-7')
        tz = ev('(()=>{const e=document.createElement("p");e.style.cssText="font-size:16px;position:absolute;visibility:hidden";e.textContent="x";document.body.appendChild(e);const v=parseFloat(getComputedStyle(e).fontSize);const r=e.getBoundingClientRect().height;e.remove();return [v,r]})()')
        rec(9, dev, cond + ' info: 16px text measures %s (textZoom evidence)' % tz, 'INFO', '', '')
        # operable: tap Start, ctx runs, tap again to stop
        if s and s['b'] <= p['vh']:
            ev("window.__osc=0")
            tap('#start'); time.sleep(3)
            q = probe()
            check(9, dev, cond + ' Start operable (playing)', bool(q['ctx']) and q['ctx']['state'] == 'running', q['ctx'], 'MUX-LAYOUT-7')
            tap('#start'); time.sleep(1)
        # slider operable: tap on its track mid-way
        if slvis:
            before = ev("+document.getElementById('slider').value")
            native_tap_css(sl[0] - sl[2] / 2 + sl[2] * 0.25, sl[1]); time.sleep(0.8)
            after = ev("+document.getElementById('slider').value")
            check(9, dev, cond + ' slider responds to tap', after != before, '%s -> %s' % (before, after), 'MUX-LAYOUT-7')
        if tap('#menu'):
            time.sleep(1); p = probe(); shot('%s_%s_font200_settings' % (dev, 'l' if ls else 'p'))
            dnb = ev("(()=>{const b=document.getElementById('done');const r=b&&b.getBoundingClientRect();return r?[r.top,r.bottom,innerHeight]:null})()")
            check(9, dev, cond + ' Settings Done reachable', bool(dnb) and dnb[1] <= dnb[2] + 0.5, dnb, 'MUX-LAYOUT-7')
            tap('#closeSettingsIcon')
    sh('settings put system font_scale 1.0')
    set_profile(dev)


HUD_JS = r"""
(() => {
  const q = s => document.querySelector(s);
  const vis = e => { if (!e) return 'absent'; const r = e.getBoundingClientRect(); for (let n = e; n && n !== document.documentElement; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || n.hidden) return 'hidden'; }
    return (r.width < 1 || r.height < 1) ? 'hidden' : 'shown ' + Math.round(r.width) + 'x' + Math.round(r.height); };
  const lines = e => { if (!e) return null; const lh = parseFloat(getComputedStyle(e).lineHeight) || 20; return Math.round(e.getBoundingClientRect().height / lh * 10) / 10; };
  const o = {};
  o.logo = vis(q('#icon'));
  o.wordmark = vis(q('.brand-name'));
  o.carrierBadge = vis(q('#carrierBadge'));
  o.title = vis(q('#title')); o.activeBandBadge = vis(q('#activeBandBadge'));
  o.audioStatus = vis(q('#audioStatus')); const as = q('#audioStatus'); o.audioStatusText = as ? (as.textContent.trim().slice(0, 12) + ' | ' + vis(as.querySelector('.status-text, span:last-child'))) : null;
  o.headerModeBtn = vis(q('#headerModeBtn')); const ml = q('#headerModeLabel'); o.headerModeLabel = vis(ml);
  o.headerBreathBtn = vis(q('#headerBreathBtn')); o.headerBreathLabel = vis(q('#headerBreathLabel'));
  o.headerStudioBtn = vis(q('#headerStudioBtn'));
  o.headerTestStereoBtn = vis(q('#headerTestStereoBtn'));
  o.menu = vis(q('#menu')); o.voiceCountBadge = vis(q('#voiceCountBadge')); o.liveFreqBadge = vis(q('#liveFreqBadge'));
  o.chartDescription = vis(q('#chartDescription')) + ' lines=' + lines(q('#chartDescription'));
  o.chartLegend = vis(q('#chartLegend'));
  const lg = q('#chartLegend'); if (lg) o.legendRows = new Set(Array.from(lg.children).map(c => Math.round(c.getBoundingClientRect().top))).size;
  o.scopeHud = vis(q('#scopeHud')); o.scopeIdleOverlay = vis(q('#scopeIdleOverlay'));
  o.pwaToasts = vis(q('#pwaUpdateToast')) + ' / install:' + vis(q('#pwaInstallBtn'));
  const hd = q('#header'); o.headerH = hd ? Math.round(hd.getBoundingClientRect().height) : null;
  o.headerOneRow = hd ? (Array.from(hd.querySelectorAll('button')).filter(b => b.getBoundingClientRect().height > 0).every(b => Math.abs(b.getBoundingClientRect().top - hd.getBoundingClientRect().top) < hd.getBoundingClientRect().height)) : null;
  o.timeFont = (() => { const t = q('#time, .time-readout, #timeDisplay'); return t ? getComputedStyle(t).fontFamily.slice(0, 30) + ' ' + getComputedStyle(t).fontSize : null; })();
  o.ariaLabels = ['#headerModeBtn', '#headerBreathBtn', '#menu'].map(s => q(s) && q(s).getAttribute('aria-label') ? 1 : 0).join('');
  o.modeAriaPressed = q('#headerModeBtn') && q('#headerModeBtn').getAttribute('aria-pressed');
  return o;
})()
"""


def hud_table(dev, cond):
    try:
        o = ev(HUD_JS)
        rec(7, dev, 'HUD table values: ' + cond, 'INFO', json.dumps(o), 'UX s7')
    except Exception as e:  # noqa
        rec(7, dev, 'HUD table values: ' + cond, 'ERROR', repr(e), 'UX s7')


def slider_test(dev):
    """MUX-IN-6 / MUX-TAP-4: tap on the track jumps, drag moves the thumb, value commits (idle session)."""
    c = center('#slider')
    if not c:
        rec(6, dev, 'time slider present', 'FAIL', '', 'MUX-IN-6'); return
    cx, cy, cw, chh = c
    left = cx - cw / 2
    mx = float(ev("+document.getElementById('slider').max"))
    before = ev("+document.getElementById('slider').value")
    native_tap_css(left + cw * 0.75, cy); time.sleep(0.8)
    a = ev("+document.getElementById('slider').value")
    check(6, dev, 'tap on slider track jumps to ~75%', abs(a - mx * 0.75) <= mx * 0.1, '%s -> %s (max %s)' % (before, a, mx), 'MUX-IN-6')
    b, _ = webview_bounds()
    d = float(ev('devicePixelRatio'))
    ox, oy = (b[0], b[1]) if b else (0, 0)
    subprocess.run(['adb', 'shell', 'input swipe %d %d %d %d 600' % (ox + (left + cw * 0.2) * d, oy + cy * d, ox + (left + cw * 0.6) * d, oy + cy * d)])
    time.sleep(0.8)
    a2 = ev("+document.getElementById('slider').value")
    check(6, dev, 'drag on slider thumb/track ends near 60%', abs(a2 - mx * 0.6) <= mx * 0.2, '%s' % a2, 'MUX-IN-6')
    ev("(()=>{const s=document.getElementById('slider'); s.value=0; s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true}))})()")


def innerless(dev):
    return PROF[dev][0] < 600


def step6(dev, yfrac=0.2, lab=''):
    """Drag on the chart: tooltip above finger, no seek, no restart; tap: seek once."""
    c = center('#chartCanvas')
    if not c or c[2] < 50:
        rec(6, dev, 'chart visible', 'FAIL', c, 'MUX-IN-1'); return
    b, _ = webview_bounds()
    d = float(ev('devicePixelRatio'))
    ox, oy = (b[0], b[1]) if b else (0, 0)
    cx, cy, cw, chh = c
    y = cy + chh * yfrac
    x1, x2 = cx - cw * 0.3, cx + cw * 0.3
    pos0 = ev("+document.getElementById('slider').value"); osc0 = ev('window.__osc')
    import threading
    pr = subprocess.Popen(['adb', 'shell', 'input swipe %d %d %d %d 2400' % (ox + x1 * d, oy + y * d, ox + x2 * d, oy + y * d)])
    time.sleep(1.2)
    tt = ev("(()=>{const t=document.getElementById('chartTooltip');if(!t)return null;const s=getComputedStyle(t);const r=t.getBoundingClientRect();return {vis:!t.classList.contains('hidden')&&s.display!=='none'&&s.visibility!=='hidden'&&parseFloat(s.opacity)>0.1,l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,txt:t.textContent.slice(0,40)}})()")
    pr.wait()
    time.sleep(0.5)
    # the finger moved ~ (1.2/2.4) along the path => its x approx at midpoint; y fixed
    fx = x1 + (x2 - x1) * 0.5
    if tt:
        check(6, dev, lab + 'drag shows tooltip', bool(tt['vis']), tt, 'MUX-IN-1')
        if tt['vis']:
            check(6, dev, lab + 'tooltip >=56px above touch point (bottom<=y-56)', tt['b'] <= y - 56 + 1, 'tooltip.bottom=%.0f finger.y=%.0f' % (tt['b'], y), 'MUX-IN-1')
            vw = ev('innerWidth')
            check(6, dev, lab + 'tooltip clamped inside window', tt['l'] >= -0.5 and tt['r'] <= vw + 0.5, 'l=%.0f r=%.0f vw=%s' % (tt['l'], tt['r'], vw), 'MUX-IN-1')
    else:
        rec(6, dev, lab + 'tooltip element missing', 'FAIL', '', 'MUX-IN-1')
    after = ev("({pos:+document.getElementById('slider').value, osc:window.__osc, hidden:document.getElementById('chartTooltip').classList.contains('hidden'), toast:(document.getElementById('appToast')||{}).className||''})")
    check(6, dev, lab + 'drag does not seek', abs(after['pos'] - pos0) <= 12, 'slider %s -> %s' % (pos0, after['pos']), 'MUX-IN-2')
    check(6, dev, lab + 'drag does not restart audio', after['osc'] == osc0, 'oscillators created %s -> %s' % (osc0, after['osc']), 'MUX-IN-2')
    check(6, dev, lab + 'tooltip hides on release', after['hidden'], '', 'MUX-IN-1')
    # tap
    osc1 = ev('window.__osc')
    tx = cx + cw * 0.25
    native_tap_css(tx, y)
    time.sleep(1.0)
    a2 = ev("({pos:+document.getElementById('slider').value, osc:window.__osc, toast:(document.getElementById('appToast')||{}).textContent||'', vis:((document.getElementById('appToast')||{}).classList||{contains:()=>false}).contains('visible')})")
    check(6, dev, lab + 'tap seeks (slider moves, "Jumped to" toast)', a2['pos'] != after['pos'] and 'Jumped' in a2['toast'], a2, 'MUX-IN-2/3')
    n = a2['osc'] - osc1
    check(6, dev, lab + 'tap restarts audio exactly once', 0 < n <= 12, 'oscillators created by one tap: %s' % n, 'MUX-IN-2')
    time.sleep(1.0)
    check(6, dev, lab + 'audio still running after seek', ev('context.state') == 'running', '', 'MUX-IN-3')


def step5(dev):
    """Rotate 4x in ~10s during playback with Settings open."""
    if not tap('#menu'):
        rec(5, dev, 'open settings', 'FAIL', '', 'MUX-ORI-4'); return
    time.sleep(1)
    # set a recognisable volume and read it back later
    vol0 = ev("document.getElementById('volumeSlider').value")
    t0 = ev('performance.timeOrigin')
    samples = []
    seq = [1, 0, 3, 0]
    for r in seq:
        rotate(r)
        for _ in range(5):
            time.sleep(0.5)
            try:
                s = ev("({ct:context.currentTime, st:context.state, pos:+document.getElementById('slider').value, settings:getComputedStyle(document.getElementById('settings')).display, notice:getComputedStyle(document.getElementById('noticeModal')).display, vw:innerWidth, vh:innerHeight, vol:document.getElementById('volumeSlider').value, o:performance.timeOrigin})")
                samples.append(s)
            except Exception as e:
                samples.append({'err': str(e)})
    err = [s for s in samples if 'err' in s]
    good = [s for s in samples if 'err' not in s]
    check(5, dev, 'page not reloaded/recreated across 4 rotations', not err and all(s['o'] == t0 for s in good), 'errors=%d' % len(err), 'MUX-ORI-2/4')
    if good:
        check(5, dev, 'AudioContext running throughout', all(s['st'] == 'running' for s in good), set(s['st'] for s in good), 'MUX-ORI-4')
        ct = [s['ct'] for s in good]
        check(5, dev, 'audio clock monotonic, no stall', all(b > a for a, b in zip(ct, ct[1:])), 'dt min=%.2f' % min([b - a for a, b in zip(ct, ct[1:])] or [0]), 'MUX-ORI-4')
        pos = [s['pos'] for s in good]
        check(5, dev, 'position monotonic', all(b >= a for a, b in zip(pos, pos[1:])), '%s..%s' % (pos[0], pos[-1]), 'MUX-ORI-4')
        check(5, dev, 'Settings stays open', all(s['settings'] != 'none' for s in good), set(s['settings'] for s in good), 'MUX-ORI-4')
        check(5, dev, 'onboarding notice not re-triggered', all(s['notice'] == 'none' for s in good), set(s['notice'] for s in good), 'MUX-ORI-4')
        check(5, dev, 'volume value preserved', all(s['vol'] == vol0 for s in good), vol0, 'MUX-ORI-4')
        check(5, dev, 'viewport followed rotation', len(set((s['vw'], s['vh']) for s in good)) >= 2, set((s['vw'], s['vh']) for s in good), 'MUX-ORI-4')
    shot('%s_rot_settings' % dev)
    rotate(0); time.sleep(1.5)
    p = probe()
    layout_checks(5, dev, 'after rotation back to portrait (settings open)', p, expect_start=False)
    time.sleep(1.0)
    tap('#closeSettingsIcon'); time.sleep(0.8)
    taps = 1
    if ev("getComputedStyle(document.getElementById('settings')).display") != 'none':
        time.sleep(1.0); tap('#closeSettingsIcon'); time.sleep(0.8); taps = 2
    ok = ev("getComputedStyle(document.getElementById('settings')).display") == 'none'
    if taps == 2:
        rec(5, dev, 'info: first tap on Close after rotation did not close Settings (harness retry used)', 'INFO', '', 'MUX-IN-5')
    check(5, dev, 'Settings closes after rotations', ok, '', 'MUX-IN-5')
    ev("document.getElementById('chartCanvas') && true")
    c = ev("(()=>{const c=document.getElementById('chartCanvas');return [c.width,c.height,c.clientWidth,c.clientHeight,devicePixelRatio]})()")
    check(5, dev, 'chart canvas re-sized to container (backing = css*min(dpr,2))', abs(c[0] - c[2] * min(c[4], 2)) <= 6 and c[0] > 0, c, 'MUX-LAYOUT-3')


# ---------------------------------------------------------------- step 12 extras (A only)
def nav_and_cutout(dev):
    CUR['dev'] = dev
    set_profile(dev)
    sh('settings put system font_scale 1.0')
    for mode, ov in (('gesture', 'com.android.internal.systemui.navbar.gestural'), ('3-button', 'com.android.internal.systemui.navbar.threebutton')):
        sh('cmd overlay disable com.android.internal.systemui.navbar.gestural; cmd overlay disable com.android.internal.systemui.navbar.threebutton; cmd overlay enable ' + ov); time.sleep(3)
        wi = sh('dumpsys window | grep -iE "navigationBar|InsetsSource.*navigation" | head -6')
        open(os.path.join(OUT, '%s_nav_%s_dumpsys.txt' % (dev, mode)), 'w').write(wi)
        launch(); time.sleep(3); ack_notice(dev)
        p = probe()
        shot('%s_p_nav_%s' % (dev, mode))
        navh = None
        m = re.search(r'navigationBars.*?frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]', wi)
        if m:
            navh = int(m.group(4)) - int(m.group(2))
        s = p['start']
        cond = 'portrait %s nav' % mode
        d = p['dpr']
        rec(12, dev, cond + ' info: system nav bar height px=%s, web --sab=%.1f css px, start gap=%s' % (navh, p['ins']['b'], s and round(s['gapBottom'], 1)), 'INFO', wi[:200], '')
        if navh is not None and s:
            wb, _ = webview_bounds()
            scr = re.findall(r'(\d+)x(\d+)', sh('wm size'))
            H = int(scr[-1][1]) if scr else 2400
            start_bottom_px = (wb[1] if wb else 0) + s['b'] * d
            check(12, dev, cond + ': Start bottom edge >=8dp above the system nav bar', start_bottom_px <= (H - navh) - 8 * d + 1,
                  'screenH=%spx navbar=%spx start-bottom=%.0fpx (needs <= %.0f) webview=%s --sab=%.1fcss' % (H, navh, start_bottom_px, (H - navh) - 8 * d, wb, p['ins']['b']), 'MUX-SAFE-3')
        layout_checks(12, dev, cond, p)
    # display cutout, landscape both directions
    sh('cmd overlay enable-exclusive --category com.android.internal.display.cutout.emulation.tall || cmd overlay enable com.android.internal.display.cutout.emulation.tall'); time.sleep(3)
    open(os.path.join(OUT, '%s_overlays.txt' % dev), 'w').write(sh('cmd overlay list | grep -iE "cutout|navbar"'))
    for r, nm in ((1, 'rot90'), (3, 'rot270'), (0, 'portrait')):
        set_profile(dev, landscape=False); rotate(r); time.sleep(2.5)
        launch(); time.sleep(3); ack_notice(dev)
        p = probe(); shot('%s_cutout_%s' % (dev, nm))
        cond = 'cutout(tall notch) %s' % nm
        rec(12, dev, cond + ' info insets css px t/r/b/l', 'INFO', p['ins'], '')
        check(12, dev, cond + ': cutout side/top inset reported to web (>0 on a cutout edge)', max(p['ins'].values()) > 0, p['ins'], 'MUX-SAFE-1')
        layout_checks(12, dev, cond, p)
    sh('cmd overlay disable com.android.internal.display.cutout.emulation.tall')
    sh('cmd overlay enable com.android.internal.systemui.navbar.gestural')
    set_profile(dev)


def fold_resize(dev):
    """MUX-SAFE-7: live resize while playing (G profile)."""
    CUR['dev'] = dev
    set_profile(dev)
    launch(); time.sleep(3); ack_notice(dev)
    tap('#start'); time.sleep(3)
    w, h, dpr = PROF['G']
    seq = [('folded 360x800', 360, 800), ('unfolded 673x841', 673, 841), ('unfolded landscape-ish 1104x841', 1104, 841), ('unfolded 673x841', 673, 841)]
    t0 = ev('performance.timeOrigin')
    for nm, ww, hh in seq:
        sh('wm size %dx%d' % (int(ww * dpr), int(hh * dpr))); time.sleep(3)
        p = probe(); shot('G_fold_%s' % nm.split()[0] + '_%d' % ww)
        check(12, dev, 'live resize -> %s' % nm, p['hscroll'] <= 1 and p['vscroll'] <= 1 and p['ctx']['state'] == 'running' and p['t0'] == t0 if p['ctx'] else False, 'vw=%s vh=%s hs=%s vs=%s ctx=%s' % (p['vw'], p['vh'], p['hscroll'], p['vscroll'], p['ctx']), 'MUX-SAFE-7')
        layout_checks(12, dev, 'live resize %s' % nm, p)
    tap('#start')


def reference_set():
    """Reference screenshots on A with a clean status bar (demo mode). Each state is verified before the shot."""
    CUR['dev'] = 'A'
    sh('settings put system font_scale 1.0')
    set_profile('A')
    sh('settings put global sysui_demo_allowed 1')
    for c in ('enter', 'clock -e hhmm 0941', 'battery -e level 100 -e plugged false', 'network -e wifi show -e level 4 -e fully true', 'network -e mobile show -e datatype none -e level 4', 'notifications -e visible false'):
        sh('am broadcast -a com.android.systemui.demo -e command ' + c)
    sh('pm clear ' + PKG)
    launch(clear=True); time.sleep(3)
    ok = probe()['open']['notice']
    rec('ref', 'A', 'REF_01 first-run notice open before shot', 'PASS' if ok else 'FAIL', '')
    shot('REF_01_first_run_notice')
    ack_notice('A'); time.sleep(1)
    tap('#start'); time.sleep(8)
    p = probe()
    rec('ref', 'A', 'REF_02 playing before shot', 'PASS' if p['status'] == 'playing' else 'FAIL', p['status'])
    shot('REF_02_compact_portrait_playing')
    tap('#btnViewWaveform'); time.sleep(3)
    shot('REF_03_compact_portrait_scope')
    tap('#btnViewCurve'); time.sleep(1.5)
    for attempt in range(3):
        tap('#menu'); time.sleep(1.5)
        if probe()['open']['settings']:
            break
    p = probe()
    rec('ref', 'A', 'REF_04 settings open before shot', 'PASS' if p['open']['settings'] else 'FAIL', p['open'])
    shot('REF_04_settings_sheet')
    for attempt in range(3):
        tap('#closeSettingsIcon'); time.sleep(1.0)
        if not probe()['open']['settings']:
            break
    set_profile('A', landscape=True); time.sleep(4)
    d = ev('[innerWidth, innerHeight]')
    rec('ref', 'A', 'REF_05 landscape viewport before shot (no relaunch)', 'PASS' if d[0] > d[1] else 'FAIL', d)
    shot('REF_05_short_landscape_playing')
    time.sleep(2)
    shot('REF_05b_short_landscape_playing_2s_later')
    tap('#start'); time.sleep(1)
    set_profile('A')
    sh('am broadcast -a com.android.systemui.demo -e command exit')


def main():
    adb('wait-for-device')
    sh('settings put global window_animation_scale 0; settings put global transition_animation_scale 0; settings put global animator_duration_scale 0')
    rec(0, 'env', 'device', 'INFO', sh('getprop ro.product.model') + ' api ' + sh('getprop ro.build.version.sdk') + ' ' + sh('wm size') + ' ' + sh('wm density'), '')
    sh('pm grant %s android.permission.POST_NOTIFICATIONS 2>/dev/null' % PKG)
    adb('install', '-r', '-g', APK)
    for dev in PROFILES:
        try:
            run_profile(dev)
        except Exception as e:  # keep going on harness errors
            import traceback; traceback.print_exc()
            rec('harness', dev, 'run_profile exception', 'ERROR', repr(e)[:300])
        if dev == 'A':
            for fn in (nav_and_cutout, reference_set):
                try:
                    fn('A') if fn is nav_and_cutout else fn()
                except Exception as e:
                    import traceback; traceback.print_exc()
                    rec('harness', 'A', fn.__name__, 'ERROR', repr(e)[:300])
        if dev == 'G':
            try: fold_resize('G')
            except Exception as e:
                import traceback; traceback.print_exc(); rec('harness', 'G', 'fold_resize', 'ERROR', repr(e)[:300])
        open(os.path.join(OUT, 'logcat_%s.txt' % dev), 'w').write(subprocess.run(['adb', 'logcat', '-d', '-t', '4000'], capture_output=True, text=True).stdout)
    sh('wm size reset; wm density reset; settings put system font_scale 1.0')


if __name__ == '__main__':
    main()
