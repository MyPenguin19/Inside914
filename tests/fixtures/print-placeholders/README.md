# Print placeholder raster references

The PNGs are visually reviewed references for `print-placeholder-visual.test.ts`.
They contain synthetic placeholders only, never customer artwork. The test compares
actual raster pixels, including AVAILABLE, ARTWORK PENDING, Inside914, slot labels,
letters and digits. A blank panel or missing-glyph boxes fails the comparison.

Reproduce a fontless serverless host (set these before Sharp/Pango initializes):

```sh
PANGOCAIRO_BACKEND=fontconfig FONTCONFIG_FILE="$PWD/tests/fixtures/print-placeholders/fonts.conf" \
  npx vitest run tests/print-placeholder-visual.test.ts
```

The old `sans-serif` SVG `<text>` renderer produced boxes with this configuration;
the checked-in Geist paths remain readable. Sharp's installation documentation
explains that SVG text depends on fontconfig and embedded SVG fonts are unsupported:
https://sharp.pixelplumbing.com/install/#fonts

To intentionally update references, run the same command with
`UPDATE_PRINT_GOLDENS=1`, inspect every changed PNG, then rerun without that flag.
Never enable reference updates in CI. Full-size synthetic front/back samples and
review thumbnails are written outside the repository to
`../../outputs/inside914-print-hotfix/`.

Glyph outlines can be regenerated with the pinned development-only command in
`scripts/generate-print-glyphs.py`. The source font is supplied by the locked Next.js
package; its SHA-256 and units-per-em are recorded in `glyphs/geist.json`, with the
SIL Open Font License alongside it. Production needs no font file, font loader,
new dependency, environment override or network access to draw these labels.
