import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// A crawlable version of the existing wordmark for Organization structured data.
export async function GET() {
  const [fraunces, geist] = await Promise.all([
    readFile(join(process.cwd(), "src/assets/fonts/Fraunces-600.ttf")),
    readFile(join(process.cwd(), "src/assets/fonts/Geist-500.ttf")),
  ]);
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "white", color: "#1c1b19" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5.76, fontFamily: "Fraunces", fontWeight: 600, fontSize: 72, letterSpacing: -3.96, lineHeight: 1 }}>
        <span>INSIDE</span><span style={{ border: "3.96px solid #1c1b19", padding: "5.76px 13.32px 5.76px 18.36px", fontFamily: "Geist", fontWeight: 500, letterSpacing: 0, lineHeight: 1 }}>914</span>
      </div>
    </div>,
    { width: 600, height: 240, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" }, fonts: [
      { name: "Fraunces", data: fraunces, style: "normal", weight: 600 },
      { name: "Geist", data: geist, style: "normal", weight: 500 },
    ] },
  );
}
