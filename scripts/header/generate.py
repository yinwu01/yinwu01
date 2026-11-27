#!/usr/bin/env python3
"""Build the profile header images (light and dark).

Input:  scripts/header/calendar.json  (daily contribution counts)
        Refresh it with:
        gh api graphql -f query='{viewer{contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}' --jq .data.viewer.contributionsCollection.contributionCalendar > scripts/header/calendar.json
Output: assets/header/header-light.svg, assets/header/header-dark.svg
Needs:  Python 3.9+, fonttools, brotli, and the Inter variable font file
        (google/fonts ofl/inter, OFL; path = first argument).
"""
import base64, io, json, math, pathlib, sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else
                    "/SSD1/wuyin/temp/fonts-inter/Inter-var.ttf")
NAME = "Yin WU"
LINE = "Recursive self-improvement and data-centric LLMs"

W, H = 840, 160
STEP, BAR_W, MAX_H, BASE_Y = 6, 2, 20, 124

THEMES = {
    "light": dict(ink="#1d1d1f", soft="#6e6e73", rest="#d2d2d7"),
    "dark":  dict(ink="#f5f5f7", soft="#a1a1a6", rest="#424245"),
}


def font_b64(text, wght, opsz):
    font = instancer.instantiateVariableFont(TTFont(FONT), {"wght": wght, "opsz": opsz})
    opts = subset.Options()
    opts.layout_features = ["kern", "liga", "calt"]
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    return base64.b64encode(buf.getvalue()).decode()


def build(theme, weeks, total):
    c = THEMES[theme]
    n = len(weeks)
    x0 = (W - ((n - 1) * STEP + BAR_W)) / 2
    top = max(weeks)
    bars = []
    for i, v in enumerate(weeks):
        x = round(x0 + i * STEP, 2)
        if v == 0:
            bars.append(f'<rect x="{x}" y="{BASE_Y - BAR_W}" width="{BAR_W}" height="{BAR_W}" rx="1" fill="{c["rest"]}"/>')
            continue
        h = round(BAR_W + (MAX_H - BAR_W) * math.sqrt(v / top), 2)
        delay = round(0.3 + 0.9 * i / n, 3)
        bars.append(f'<rect class="b" style="animation-delay:{delay}s" x="{x}" y="{round(BASE_Y - h, 2)}" '
                    f'width="{BAR_W}" height="{h}" rx="1" fill="{c["ink"]}"/>')
    caption = f"{total:,} contributions in the past year, one bar per week"
    display = font_b64(NAME, 600, 32)
    body = font_b64(LINE + caption, 400, 16)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d">
<title id="t">{NAME}. {LINE}</title>
<desc id="d">{caption}.</desc>
<style>
@font-face{{font-family:"HD";font-weight:600;src:url(data:font/woff2;base64,{display}) format("woff2")}}
@font-face{{font-family:"HB";font-weight:400;src:url(data:font/woff2;base64,{body}) format("woff2")}}
.n{{font:600 32px "HD",-apple-system,"Helvetica Neue",Arial,sans-serif;fill:{c["ink"]};letter-spacing:-0.7px}}
.l{{font:400 17px "HB",-apple-system,"Helvetica Neue",Arial,sans-serif;fill:{c["soft"]};letter-spacing:-0.2px}}
.c{{font:400 11px "HB",-apple-system,"Helvetica Neue",Arial,sans-serif;fill:{c["soft"]}}}
.b{{transform-box:fill-box;transform-origin:50% 100%;animation:g .6s cubic-bezier(.2,.7,.2,1) both}}
@keyframes g{{from{{transform:scaleY(0)}}to{{transform:scaleY(1)}}}}
@media (prefers-reduced-motion:reduce){{.b{{animation:none}}}}
</style>
<text class="n" x="{W / 2}" y="44" text-anchor="middle">{NAME}</text>
<text class="l" x="{W / 2}" y="74" text-anchor="middle">{LINE}</text>
{chr(10).join(bars)}
<text class="c" x="{W / 2}" y="{BASE_Y + 22}" text-anchor="middle">{caption}</text>
</svg>
'''


def main():
    cal = json.loads((ROOT / "scripts/header/calendar.json").read_text())
    weeks = [sum(d["contributionCount"] for d in w["contributionDays"]) for w in cal["weeks"]]
    for theme in THEMES:
        out = ROOT / f"assets/header/header-{theme}.svg"
        out.write_text(build(theme, weeks, cal["totalContributions"]))
        print(out.relative_to(ROOT), out.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
