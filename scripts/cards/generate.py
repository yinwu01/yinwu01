#!/usr/bin/env python3
"""Build the project cards (light and dark) in assets/cards/.

Needs: Python 3.9+, fonttools, brotli, the Inter variable font
(google/fonts ofl/inter, OFL; path = first argument). No network.
The star counts in CARDS are typed by hand. Update them before a rebuild.
"""
import base64, io, pathlib, sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/SSD1/wuyin/temp/fonts-inter/Inter-var.ttf")

# slug, owner, name, sentence, number
CARDS = [
    ("supervisor-skills", "HKUSTDial", "Supervisor-Skills",
     "Ten years of a PhD supervisor's research experience, as skills that your agent can call.", "★ 13.7k"),
    ("ducktor", "HKUSTDial", "Ducktor",
     "A research mentor inside your coding agent. You learn while the agent does the work.", "★ 116"),
    ("deepseek-ducktor", "HKUSTDial", "DeepSeek-Ducktor",
     "Ducktor as a native plugin for DeepSeek Harness.", "★ 50"),
    ("magpie", "yetone", "magpie",
     "Pools the AI plans you pay for and serves them to any agent.", "60+ commits"),
    ("mika", "wangzan101", "Mika",
     "An on-device AI agent for Android.", "14+ merged pull requests"),
    ("evodesign", "GeminiLight", "EvoDesign",
     "A workspace for editable diagrams that you build together with an agent.", "4 merged pull requests"),
]

W, H, PAD = 400, 232, 30
THEMES = {
    "light": dict(bg="#f5f5f7", ink="#1d1d1f", soft="#6e6e73"),
    "dark":  dict(bg="#1c1c1e", ink="#f5f5f7", soft="#a1a1a6"),
}


def instance(wght, opsz):
    return instancer.instantiateVariableFont(TTFont(FONT), {"wght": wght, "opsz": opsz})


def b64(font, text):
    opts = subset.Options()
    opts.layout_features = ["kern"]
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    return base64.b64encode(buf.getvalue()).decode()


def wrap(font, text, size, width):
    cmap, hmtx, upm = font.getBestCmap(), font["hmtx"], font["head"].unitsPerEm
    measure = lambda s: sum(hmtx[cmap[ord(ch)]][0] for ch in s) * size / upm
    lines, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if measure(trial) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    return lines + [cur]


def build(theme, owner, name, sentence, number):
    c = THEMES[theme]
    lines = wrap(instance(400, 14), sentence, 19, W - 2 * PAD)
    body = "".join(f'<text class="s" x="{PAD}" y="{122 + i * 27}">{ln}</text>' for i, ln in enumerate(lines))
    bold = b64(instance(600, 28), name)
    reg = b64(instance(400, 14), owner + sentence + number)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="{owner}/{name}. {sentence} {number}">
<style>
@font-face{{font-family:"B";font-weight:600;src:url(data:font/woff2;base64,{bold}) format("woff2")}}
@font-face{{font-family:"R";font-weight:400;src:url(data:font/woff2;base64,{reg}) format("woff2")}}
text{{font-family:"R",-apple-system,"Helvetica Neue",Arial,sans-serif;fill:{c["soft"]}}}
.o{{font-size:16px}}
.n{{font:600 28px "B",-apple-system,"Helvetica Neue",Arial,sans-serif;fill:{c["ink"]};letter-spacing:-0.5px}}
.s{{font-size:19px;letter-spacing:-0.1px}}
.k{{font-size:16px;fill:{c["ink"]}}}
</style>
<rect width="{W}" height="{H}" rx="26" fill="{c["bg"]}"/>
<text class="o" x="{PAD}" y="48">{owner}</text>
<text class="n" x="{PAD}" y="84">{name}</text>
{body}
<text class="k" x="{PAD}" y="{H - 28}">{number}</text>
</svg>
'''


if __name__ == "__main__":
    for slug, owner, name, sentence, number in CARDS:
        for theme in THEMES:
            (ROOT / f"assets/cards/{slug}-{theme}.svg").write_text(build(theme, owner, name, sentence, number))
    print(len(CARDS) * 2, "files written")
