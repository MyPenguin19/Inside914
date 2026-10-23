"""Development only: uv run --with fonttools==4.60.1 python scripts/generate-print-glyphs.py

Uses the Geist Regular font bundled with the locked Next.js dependency. Runtime
exports use only the generated outlines, never fontconfig or the font file.
"""
from pathlib import Path
import hashlib
import json
import string
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

root = Path(__file__).resolve().parent.parent
source = root / "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"
font = TTFont(source)
glyph_set = font.getGlyphSet()
cmap = font.getBestCmap()
glyphs = {}
for char in string.ascii_letters + string.digits + " ·":
    name = cmap[ord(char)]
    pen = SVGPathPen(glyph_set)
    glyph_set[name].draw(pen)
    glyphs[char] = {"advance": font["hmtx"][name][0], "path": pen.getCommands()}
output = {
    "source": "Geist Regular, Copyright 2024 The Geist Project Authors; SIL OFL 1.1 (OFL.txt)",
    "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "unitsPerEm": font["head"].unitsPerEm,
    "glyphs": glyphs,
}
(root / "src/lib/print/glyphs/geist.json").write_text(json.dumps(output, indent=2) + "\n")
