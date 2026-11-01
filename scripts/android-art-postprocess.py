#!/usr/bin/env python3
"""Finish the Android art after `capacitor-assets generate` (idempotent).

`@capacitor/assets` 3.0.x (a) draws the adaptive layers at launcher size (48 dp) and shrinks
them again with a 16.7% inset, so the art ends up at ~33% of the layer instead of the 66%
safe zone the masters are drawn for; (b) has no monochrome / themed-icon, notification-icon
or Android 12 splash-icon support; (c) leaves the Capacitor placeholder drawables behind.
This script fixes all three from the masters in assets/. Needs Pillow only.

    python3 -m venv .venv-art && .venv-art/bin/pip install pillow
    npm run assets          # = capacitor-assets generate ... && this script
"""
import os
import re

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
IOS_SPLASH = os.path.join(ROOT, "ios", "App", "App", "Assets.xcassets", "Splash.imageset")
ASSETS = os.path.join(ROOT, "assets")

SCALE = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}


def load(name):
    return Image.open(os.path.join(ASSETS, name)).convert("RGBA")


def save(img, *parts):
    path = os.path.join(RES, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)


def write(rel, text):
    path = os.path.join(RES, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def remove(path):
    if os.path.exists(path):
        os.remove(path)
        print("removed", os.path.relpath(path, ROOT))


def main():
    fg, bg, mono = load("icon-foreground.png"), load("icon-background.png"), load("icon-monochrome.png")

    # 1. Adaptive layers: 108 dp, no inset (masters already keep art inside the 66% safe zone).
    for d, s in SCALE.items():
        px = round(108 * s)
        save(bg.convert("RGB").resize((px, px), Image.LANCZOS), f"mipmap-{d}", "ic_launcher_background.png")
        save(fg.resize((px, px), Image.LANCZOS), f"mipmap-{d}", "ic_launcher_foreground.png")
        save(mono.resize((px, px), Image.LANCZOS), f"mipmap-{d}", "ic_launcher_monochrome.png")
    adaptive = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@mipmap/ic_launcher_background" />\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
        '    <!-- Android 13+ themed icons -->\n'
        '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />\n'
        '</adaptive-icon>\n'
    )
    write("mipmap-anydpi-v26/ic_launcher.xml", adaptive)
    write("mipmap-anydpi-v26/ic_launcher_round.xml", adaptive)
    # ldpi is not a real target at minSdk 24; drop what the generator adds.
    for n in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png", "ic_launcher_background.png"):
        remove(os.path.join(RES, "mipmap-ldpi", n))

    # 2. Notification small icon: 24 dp white-on-transparent, 20 dp glyph centred (2 dp padding).
    a = mono.getchannel("A")
    glyph = mono.crop(a.point(lambda v: 255 if v > 128 else 0).getbbox())
    for d, s in SCALE.items():
        px, inner = round(24 * s), round(20 * s)
        k = inner / max(glyph.size)
        g = glyph.resize((max(1, round(glyph.size[0] * k)), max(1, round(glyph.size[1] * k))), Image.LANCZOS)
        c = Image.new("RGBA", (px, px), (255, 255, 255, 0))
        c.alpha_composite(g, ((px - g.size[0]) // 2, (px - g.size[1]) // 2))
        save(c, f"drawable-{d}", "ic_stat_binality.png")

    # 3. Android 12+ splash icon: 288 dp canvas, art inside the central 192 dp circle
    #    (icon-foreground keeps its art inside 66% = 190 dp of 288 dp).
    for d, s in SCALE.items():
        px = round(288 * s)
        save(fg.resize((px, px), Image.LANCZOS), f"drawable-{d}", "splash_icon.png")
    write(
        "values/colors.xml",
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        '    <color name="splash_background">#070314</color>\n'
        "    <!-- Accent for the foreground-service notification (setColor) -->\n"
        '    <color name="notification_accent">#E9A6F5</color>\n'
        "</resources>\n",
    )
    styles = os.path.join(RES, "values", "styles.xml")
    with open(styles, encoding="utf-8") as f:
        s = f.read()
    block = (
        '<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">\n'
        "        <!-- API < 31: legacy full-screen drawable (generated splash.png). -->\n"
        '        <item name="android:background">@drawable/splash</item>\n'
        "        <!-- API 31+ system splash: #070314 and the logo inside the central 192 dp of 288 dp. -->\n"
        '        <item name="windowSplashScreenBackground">@color/splash_background</item>\n'
        '        <item name="windowSplashScreenAnimatedIcon">@drawable/splash_icon</item>\n'
        "    </style>"
    )
    s, n = re.subn(r'<style name="AppTheme\.NoActionBarLaunch".*?</style>', block, s, flags=re.S)
    assert n == 1, "AppTheme.NoActionBarLaunch not found in styles.xml"
    with open(styles, "w", encoding="utf-8", newline="\n") as f:
        f.write(s)

    # 4. Capacitor placeholder art left behind by `cap add` / earlier generator runs.
    for p in (
        os.path.join(RES, "drawable", "ic_launcher_background.xml"),      # teal grid
        os.path.join(RES, "drawable-v24", "ic_launcher_foreground.xml"),  # Android robot
        os.path.join(RES, "values", "ic_launcher_background.xml"),        # #FFFFFF
        os.path.join(IOS_SPLASH, "splash-2732x2732.png"),
        os.path.join(IOS_SPLASH, "splash-2732x2732-1.png"),
        os.path.join(IOS_SPLASH, "splash-2732x2732-2.png"),
    ):
        remove(p)


if __name__ == "__main__":
    main()
