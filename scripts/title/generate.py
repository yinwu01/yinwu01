#!/usr/bin/env python3
"""Build the profile title images (light and dark).

The title is one monospace line. The start of the line is typed one time.
The end of the line is typed, deleted and typed again in a better version,
and the last version stays.

The letters are drawn as outlines. No font is embedded, because GitHub
serves repository SVG files with a policy that blocks embedded fonts.

Usage:  generate.py [path/to/IBMPlexMono-Medium.otf]
Output: assets/title-light.svg, assets/title-dark.svg
Needs:  Python 3.9+, fonttools, IBM Plex Mono Medium
        (github.com/IBM/plex, SIL Open Font License 1.1). No network.
"""
import pathlib, sys
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
FONT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else
                    "/home/wuyin/.local/share/fonts/paper_otf_unused/IBMPlexMono-Medium.otf")

PREFIX = "Hi, I'm Yin WU. I work on "
TAILS = ["LLMs.", "LLMs that learn from better data.", "LLMs that improve themselves."]

SIZE = 20
W, H, BASE = 784, 44, 29
START, TYPE, DELETE, HOLD = 0.5, 0.055, 0.026, 1.0
BLINKS = 8

THEMES = {
    "light": dict(ink="#1f2328", cursor="#0969da"),
    "dark":  dict(ink="#f0f6fc", cursor="#4493f8"),
}


def timeline():
    """Return (chars, cursor, total): chars = (col, char, t_on, t_off or None).

    Between two versions, only the part that differs is deleted.
    """
    t, chars, cursor, live = START, [], [(0.0, 0)], []
    lines = [PREFIX + tail for tail in TAILS]
    for n, line in enumerate(lines):
        keep = 0
        while keep < len(live) and keep < len(line) and live[keep][0] == line[keep]:
            keep += 1
        if n:
            t += HOLD
            while len(live) > keep:
                ch, on = live.pop()
                chars.append((len(live), ch, on, t))
                cursor.append((t, len(live)))
                t += DELETE
            t += 0.25
        for ch in line[keep:]:
            live.append((ch, t))
            cursor.append((t, len(live)))
            t += TYPE
    chars += [(i, ch, on, None) for i, (ch, on) in enumerate(live)]
    return chars, cursor, t


def load_font():
    if not FONT.is_file():
        sys.exit(f"Font file not found: {FONT}\nusage: generate.py path/to/IBMPlexMono-Medium.otf")
    font = TTFont(FONT)
    glyphs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm
    widths = {font["hmtx"][cmap[ord(ch)]][0] for ch in set(PREFIX + "".join(TAILS))}
    if len(widths) != 1:
        sys.exit("The font is not monospace for the title text.")
    outlines = {}
    for ch in set(PREFIX + "".join(TAILS)) - {" "}:
        pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:g}")
        glyphs[cmap[ord(ch)]].draw(pen)
        outlines[ch] = pen.getCommands()
    return outlines, widths.pop() / upm, SIZE / upm


def build(theme, outlines, advance, scale):
    c = THEMES[theme]
    cw = SIZE * advance
    chars, cursor, total = timeline()
    final = PREFIX + TAILS[-1]
    x0 = round((W - len(final) * cw) / 2, 2)
    pct = lambda t: f"{100 * t / total:.3f}%"
    ids = {ch: f"g{i}" for i, ch in enumerate(sorted(outlines))}
    defs = "".join(f'<path id="{ids[ch]}" d="{outlines[ch]}" transform="scale({scale:g},{-scale:g})"/>' for ch in sorted(outlines))
    css, body = [], []
    for k, (col, ch, on, off) in enumerate(chars):
        if ch == " ":
            continue
        frames = f"0%{{opacity:0}}{pct(on)}{{opacity:1}}"
        if off is not None:
            frames += f"{pct(off)}{{opacity:0}}"
        frames += f"100%{{opacity:{0 if off is not None else 1}}}"
        css.append(f"@keyframes k{k}{{{frames}}}")
        cls = "ch" if off is not None else "ch fin"
        body.append(f'<use class="{cls}" style="animation-name:k{k}" href="#{ids[ch]}" x="{round(x0 + col * cw, 2)}" y="{BASE}"/>')
    moves = "".join(f"{pct(t)}{{transform:translateX({round(col * cw, 2)}px)}}" for t, col in cursor)
    end = round(len(final) * cw, 2)
    css.append(f"@keyframes cur{{{moves}100%{{transform:translateX({end}px)}}}}")
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t">
<title id="t">{final}</title>
<style>
use{{fill:{c["ink"]}}}
.ch{{opacity:0;animation-duration:{total:.3f}s;animation-timing-function:step-end;animation-fill-mode:both}}
.fin{{opacity:1}}
.cur{{transform:translateX({end}px);animation:cur {total:.3f}s step-end both}}
.blink{{animation:bl 1.1s step-end {total + 0.4:.3f}s {BLINKS}}}
@keyframes bl{{50%{{opacity:0}}}}
{chr(10).join(css)}
@media (prefers-reduced-motion:reduce){{.ch,.cur,.blink{{animation:none!important}}}}
</style>
<defs>{defs}</defs>
{chr(10).join(body)}
<g class="cur"><rect class="blink" x="{x0 + 1}" y="{BASE - 17}" width="{cw - 2:g}" height="22" rx="1" fill="{c["cursor"]}"/></g>
</svg>
'''


if __name__ == "__main__":
    font = load_font()
    for theme in THEMES:
        out = ROOT / f"assets/title-{theme}.svg"
        out.write_text(build(theme, *font), encoding="utf-8")
        print(out.relative_to(ROOT), out.stat().st_size, "bytes")
