#!/usr/bin/env python3
"""Build the art masters in assets/ from the v2 icon.

Source of truth: images/binality-icon-1024.png (the v2 icon: a glowing meditating
figure on an indigo tile with transparent rounded corners).

Run from the repo root (needs Pillow, NumPy, SciPy; not needed for CI or normal builds):

    python3 -m venv .venv-art && .venv-art/bin/pip install pillow numpy scipy
    .venv-art/bin/python scripts/build-art-masters.py

Outputs (all committed, then fed to `npx capacitor-assets generate`):
  assets/icon-only.png        1024, opaque, full-bleed, no rounded corners
  assets/icon-foreground.png  1024, transparent, art inside the central 66% circle
  assets/icon-background.png  1024, #070314 -> deep indigo gradient, no art
  assets/icon-monochrome.png  1024, white silhouette on transparent (themed icons)
  assets/splash.png           2732, #070314, logo inside the central 1200x1200
  assets/splash-dark.png      2732, same (the app is dark-only)
  assets/play-store-icon-512.png  512, Play listing icon (<= 1 MB)
  apple-touch-icon-precomposed.png          180, opaque (web / iOS home screen)
  images/binality-icon-512-maskable.png     512, opaque, PWA maskable

The Android layers, notification glyph and Android 12 splash icon are derived from these by
scripts/android-art-postprocess.py (run after `capacitor-assets generate`).
"""
import os

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "images", "binality-icon-1024.png")
OUT = os.path.join(ROOT, "assets")
BG = (7, 3, 20)          # #070314
INDIGO = (22, 16, 92)    # deep indigo at the tile edges
GLOW = (170, 70, 235)    # purple halo around the figure


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def extract_figure():
    """Return (rgb, alpha) float arrays of the figure only, 1024x1024, centred on its bbox."""
    a = np.array(Image.open(SRC).convert("RGBA")).astype(np.float32)
    lum = a[..., :3].max(axis=2)
    # The figure is the bright pink body (max channel >= ~215); the halo is darker purple.
    # Hard threshold at the edge midpoint, keep the largest blob, fill pinholes, then 1 px blur for AA.
    m = lum > 215
    lab, n = ndi.label(m)
    sizes = ndi.sum(m, lab, range(1, n + 1))
    m = lab == (1 + int(np.argmax(sizes)))
    # Fill only tiny pinholes; the arm/torso gaps are real negative space and must stay open.
    hl, hn = ndi.label(~m)
    hsz = ndi.sum(~m, hl, range(1, hn + 1))
    for i, s in enumerate(hsz, start=1):
        if s < 300:
            m |= hl == i
    alpha = ndi.gaussian_filter(m.astype(np.float32), 1.0)
    ys, xs = np.where(alpha > 0.5)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    rgb = a[..., :3]
    # Fill colour of transparent pixels with the nearest body colour so scaling doesn't fringe.
    body = np.array([245, 190, 250], np.float32)
    rgb = np.where(alpha[..., None] > 0.05, rgb, body)
    return rgb, alpha, (cx, cy)


def place(rgb, alpha, centre, scale, size, offset=(0, 0)):
    """Scale the figure about its bbox centre and drop it on a size x size canvas."""
    cx, cy = centre
    img = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA")
    w, h = img.size
    nw, nh = int(round(w * scale)), int(round(h * scale))
    img = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = int(round(size / 2 + offset[0] - cx * scale))
    oy = int(round(size / 2 + offset[1] - cy * scale))
    paste_clipped(canvas, img, ox, oy)
    return canvas


def paste_clipped(canvas, img, ox, oy):
    tmp = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    tmp.paste(img, (ox, oy))
    canvas.alpha_composite(tmp)


def with_glow(fig, strength=0.85, sigma_frac=0.022, spread_frac=0.05):
    """Add a purple halo behind an RGBA figure layer (returns a new RGBA)."""
    size = fig.size[0]
    a = fig.getchannel("A")
    halo = a.filter(ImageFilter.MaxFilter(1)).filter(ImageFilter.GaussianBlur(size * spread_frac))
    tight = a.filter(ImageFilter.GaussianBlur(size * sigma_frac))
    h = np.maximum(np.array(halo, np.float32) * 0.55, np.array(tight, np.float32)) * strength
    glow = np.zeros((size, size, 4), np.float32)
    glow[..., 0], glow[..., 1], glow[..., 2] = GLOW
    glow[..., 3] = np.clip(h, 0, 255)
    out = Image.fromarray(glow.astype(np.uint8), "RGBA")
    out.alpha_composite(fig)
    return out


def background(size):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    r = np.hypot(x - size / 2, y - size / 2) / (size / 2 * 1.4142)
    t = smoothstep(0.30, 1.0, r)[..., None]
    c = np.array(BG, np.float32) * (1 - t) + np.array(INDIGO, np.float32) * t
    # +-0.5 LSB noise (fixed seed, reproducible) so the dark gradient does not band.
    c += np.random.default_rng(7).uniform(-0.5, 0.5, c.shape).astype(np.float32)
    return Image.fromarray(np.clip(np.rint(c), 0, 255).astype(np.uint8), "RGB")


def max_radius(img, thresh=8):
    a = np.array(img.getchannel("A"))
    ys, xs = np.where(a > thresh)
    c = img.size[0] / 2
    return float(np.hypot(xs - c, ys - c).max())


def main():
    os.makedirs(OUT, exist_ok=True)
    rgb, alpha, centre = extract_figure()

    # --- icon-only: full-bleed opaque tile (figure + halo on gradient) ---
    fig = place(rgb, alpha, centre, 1.0, 1024, offset=(0, 4))
    only = background(1024).convert("RGBA")
    only.alpha_composite(with_glow(fig))
    only.convert("RGB").save(os.path.join(OUT, "icon-only.png"), optimize=True)

    # --- icon-background ---
    background(1024).save(os.path.join(OUT, "icon-background.png"), optimize=True)

    # --- icon-foreground: artwork incl. halo inside the central 66% circle (r = 338 px) ---
    # Halo fades to ~0 well before the circle edge; figure itself is fitted on a smaller radius.
    scale = 0.78
    fgfig = place(rgb, alpha, centre, scale, 1024)
    fg = with_glow(fgfig, spread_frac=0.035)
    fg.save(os.path.join(OUT, "icon-foreground.png"), optimize=True)
    print("foreground figure radius", round(max_radius(fgfig, 128), 1), "with halo(a>8)", round(max_radius(fg, 8), 1), "limit 338")

    # --- icon-monochrome: white silhouette, same fit as the foreground ---
    mono = Image.new("RGBA", (1024, 1024), (255, 255, 255, 0))
    mono.putalpha(fgfig.getchannel("A"))
    mono.save(os.path.join(OUT, "icon-monochrome.png"), optimize=True)

    # --- splash: logo (figure + halo, no tile) in the central 1200x1200 of 2732 ---
    logo = place(rgb, alpha, centre, 1.42, 2732)
    logo = with_glow(logo, spread_frac=0.012, sigma_frac=0.006)
    splash = Image.new("RGBA", (2732, 2732), BG + (255,))
    splash.alpha_composite(logo)
    splash.convert("RGB").save(os.path.join(OUT, "splash.png"), optimize=True)
    splash.convert("RGB").save(os.path.join(OUT, "splash-dark.png"), optimize=True)
    print("splash logo radius (a>8)", round(max_radius(logo, 8), 1), "limit 600 (half of 1200)")

    # --- Play listing icon: 512, 32-bit PNG, from the opaque full-bleed master ---
    Image.open(os.path.join(OUT, "icon-only.png")).convert("RGBA").resize((512, 512), Image.LANCZOS).save(
        os.path.join(OUT, "play-store-icon-512.png"), optimize=True)

    # --- Web: apple-touch-icon 180 (opaque, iOS rounds it) and a 512 maskable PWA icon ---
    # Maskable = full-bleed opaque background + foreground (art inside 66% < the 80% safe zone).
    Image.open(os.path.join(OUT, "icon-only.png")).convert("RGB").resize((180, 180), Image.LANCZOS).save(
        os.path.join(ROOT, "apple-touch-icon-precomposed.png"), optimize=True)
    maskable = background(1024).convert("RGBA")
    maskable.alpha_composite(fg)
    maskable.convert("RGB").resize((512, 512), Image.LANCZOS).save(
        os.path.join(ROOT, "images", "binality-icon-512-maskable.png"), optimize=True)


if __name__ == "__main__":
    main()
