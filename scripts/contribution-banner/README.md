# Contribution banner generator

This repository powers the profile README. It does not replace the native GitHub contribution chart or alter contribution dates or counts.

The artwork uses real public daily contribution data, muted slate-blue letters, light/dark exports, and a snake that consumes only the decorative text. The complete text remains visible for 3 seconds; the snake moves every ~26.7 ms and exits downwards. All SVGs are script-free and include a reduced-motion fallback.

## Maintenance

- `renderer.js`: font, layout, contribution shades, light/dark themes.
- `animation.js`: routes and SVG/CSS keyframes.
- `generate.cjs`: read public contributions and emit standalone SVG files. No personal access token is required.
- `calendar.json`: fixed public-data snapshot used only by regression tests, not the live profile data.
- `.github/workflows/update-contribution-banner.yml`: scheduled refresh at 00:23 UTC (08:23 UTC+8), also manually runnable. Scheduled jobs can be delayed by GitHub.

Run all tests from the repository root:

```sh
node --test scripts/contribution-banner/test.cjs scripts/contribution-banner/animation.test.cjs scripts/contribution-banner/generate.test.cjs
```

The workflow regenerates both images from the repository owner's public calendar. It commits only changed SVG files and uses the repository-scoped GitHub Actions token, not a personal token. Future biography edits can be made outside the marked banner block in the root README.
