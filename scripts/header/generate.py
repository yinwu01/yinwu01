#!/usr/bin/env python3
"""Build the profile header images (light and dark).

Input:  scripts/header/calendar.json  (daily contribution counts)
        Refresh it with:
        gh api graphql -f query='{viewer{contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}}}' --jq .data.viewer.contributionsCollection.contributionCalendar > scripts/header/calendar.json
Output: assets/header/header-light.svg, assets/header/header-dark.svg
Needs:  Python 3.9+, fonttools, brotli, and the two Source Serif 4 font files.
"""
import base64, io, json, math, pathlib, sys
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONT_DIR = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else
                        "/home/wuyin/.local/share/fonts/paper_otf_unused")
NAME = "Yin WU"
LINE = "Recursive self-improvement and data-centric LLMs"

W, H = 840, 236
STRIP_X0, STRIP_X1 = 60, 780
BASE_Y, MAX_H = 196, 40

THEMES = {
    "light": dict(ink="#1f2328", soft="#59636e", bar="#2a47c9", rest="#c9d1d9"),
    "dark":  dict(ink="#f0f6fc", soft="#9198a1", bar="#8da2ff", rest="#3d444d"),
}


def font_b64(filename, text):
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga"]
    font = TTFont(FONT_DIR / filename)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    return base64.b64encode(buf.getvalue()).decode()


def month_name(date):
    names = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
    y, m, _ = date.split("-")
    return f"{names[int(m) - 1]} {y}"


def build(theme, days):
    c = THEMES[theme]
    n = len(days)
    step = (STRIP_X1 - STRIP_X0) / n
    bw = round(step * 0.56, 2)
    top = max(d["contributionCount"] for d in days)
    bars = []
    for i, d in enumerate(days):
        v = d["contributionCount"]
        x = round(STRIP_X0 + i * step, 2)
        if v == 0:
            bars.append(f'<rect x="{x}" y="{BASE_Y - 1.5}" width="{bw}" height="1.5" fill="{c["rest"]}"/>')
            continue
        h = round(3 + (MAX_H - 3) * math.sqrt(v / top), 2)
        delay = round(0.5 + 1.3 * i / n, 3)
        bars.append(f'<rect class="b" style="animation-delay:{delay}s" x="{x}" y="{round(BASE_Y - h, 2)}" '
                    f'width="{bw}" height="{h}" rx="{round(bw / 2, 2)}" fill="{c["bar"]}"/>')
    total = sum(d["contributionCount"] for d in days)
    caption = (f"One bar per day. {total:,} contributions, "
               f"{month_name(days[0]['date'])} to {month_name(days[-1]['date'])}")
    display = font_b64("SourceSerif4Display-Semibold.otf", NAME)
    italic = font_b64("SourceSerif4-It.otf", LINE + caption)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t d">
<title id="t">{NAME}. {LINE}</title>
<desc id="d">{caption}.</desc>
<style>
@font-face{{font-family:"HD";font-weight:600;src:url(data:font/woff2;base64,{display}) format("woff2")}}
@font-face{{font-family:"HI";font-style:italic;src:url(data:font/woff2;base64,{italic}) format("woff2")}}
.n{{font:600 76px "HD",Georgia,serif;fill:{c["ink"]};letter-spacing:-1px}}
.l{{font:italic 21px "HI",Georgia,serif;fill:{c["soft"]}}}
.c{{font:italic 12.5px "HI",Georgia,serif;fill:{c["soft"]}}}
.b{{transform-box:fill-box;transform-origin:50% 100%;animation:g .7s cubic-bezier(.2,.7,.2,1) both}}
@keyframes g{{from{{transform:scaleY(0)}}to{{transform:scaleY(1)}}}}
@media (prefers-reduced-motion:reduce){{.b{{animation:none}}}}
</style>
<text class="n" x="{W / 2}" y="84" text-anchor="middle">{NAME}</text>
<text class="l" x="{W / 2}" y="124" text-anchor="middle">{LINE}</text>
{chr(10).join(bars)}
<text class="c" x="{W / 2}" y="{BASE_Y + 24}" text-anchor="middle">{caption}</text>
</svg>
'''


def main():
    cal = json.loads((ROOT / "scripts/header/calendar.json").read_text())
    days = [d for w in cal["weeks"] for d in w["contributionDays"]][-365:]
    for theme in THEMES:
        out = ROOT / f"assets/header/header-{theme}.svg"
        out.write_text(build(theme, days))
        print(out.relative_to(ROOT), out.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
