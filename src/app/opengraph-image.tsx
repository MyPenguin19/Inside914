import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SOCIAL_IMAGE_ALT } from "@/lib/seo";

export const alt = SOCIAL_IMAGE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generated on the server. No third-party image request, watermark, or customer artwork.
export default async function OpenGraphImage() {
  const [fraunces, geist] = await Promise.all([
    readFile(join(process.cwd(), "src/assets/fonts/Fraunces-600.ttf")),
    readFile(join(process.cwd(), "src/assets/fonts/Geist-500.ttf")),
  ]);
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", padding: 78, background: "#fbfaf7", color: "#1c1b19", flexDirection: "column", justifyContent: "space-between", fontFamily: "Geist", fontWeight: 500 }}>
      <div style={{ display: "flex", alignItems: "center", fontFamily: "Fraunces", fontWeight: 600, fontSize: 56, letterSpacing: -2 }}>
        <span>Inside</span><span style={{ color: "#1f5c4a" }}>914</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
        <span style={{ color: "#1f5c4a", fontSize: 25, letterSpacing: 3 }}>WESTCHESTER COUNTY</span>
        <span style={{ fontFamily: "Fraunces", fontSize: 76, fontWeight: 600, letterSpacing: -2, lineHeight: 1.11, marginTop: 23 }}>Shared Postcard</span>
        <span style={{ fontFamily: "Fraunces", fontSize: 76, fontWeight: 600, letterSpacing: -2, lineHeight: 1.11 }}>Advertising</span>
        <span style={{ fontSize: 28, color: "#5f5b53", marginTop: 27 }}>Explore postcard advertising areas with Inside914.</span>
      </div>
      <div style={{ display: "flex", width: "100%", height: 10, background: "#1f5c4a", borderRadius: 8 }} />
    </div>,
    { ...size, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" }, fonts: [
      { name: "Fraunces", data: fraunces, style: "normal", weight: 600 },
      { name: "Geist", data: geist, style: "normal", weight: 500 },
    ] },
  );
}
