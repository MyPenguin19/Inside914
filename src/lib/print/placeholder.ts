import outlines from "./glyphs/geist.json";

// Font-independent SVG outlines. SVG <text> delegates to host fontconfig and
// becomes missing-glyph boxes on fontless serverless hosts. Do not reintroduce it.
function centeredLabel(text: string, width: number, baseline: number, size: number) {
  const glyphs = Array.from(text, char => {
    const glyph = outlines.glyphs[char as keyof typeof outlines.glyphs];
    if (!glyph) throw new Error(`Unsupported print placeholder character: ${char}`);
    return glyph;
  });
  const advance = glyphs.reduce((sum, glyph) => sum + glyph.advance, 0);
  const scale = Math.min(size / outlines.unitsPerEm, width * 0.9 / advance);
  let x = 0;
  const paths = glyphs.map(glyph => {
    const path = `<path transform="translate(${x} 0)" d="${glyph.path}"/>`;
    x += glyph.advance;
    return path;
  }).join("");
  return `<g transform="translate(${(width - advance * scale) / 2} ${baseline}) scale(${scale} ${-scale})">${paths}</g>`;
}

export function placeholderSvg(width: number, height: number, label: string, occupied: boolean): Buffer {
  const lines = [
    centeredLabel(occupied ? "ARTWORK PENDING" : "AVAILABLE", width, height * 0.43, 90),
    centeredLabel("Inside914", width, height * 0.51, 75),
    centeredLabel(`${label} · ${occupied ? "Reserved space" : "Reserve this space"}`, width, height * 0.59, 60),
  ];
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f5f5f5"/><g fill="#555">${lines.join("")}</g></svg>`);
}
