import { ImageResponse } from "next/og";

export const alt = "Inside914 — Shared postcard advertising for Westchester businesses";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Generated on the server. No third-party image request, watermark, or customer artwork.
export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", padding: 78, background: "#fbfaf7", color: "#1c1b19", flexDirection: "column", justifyContent: "space-between", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", fontWeight: 700, fontSize: 56, letterSpacing: -2 }}>
        <span>Inside</span><span style={{ color: "#1f5c4a" }}>914</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
        <span style={{ color: "#1f5c4a", fontSize: 25, letterSpacing: 3, fontWeight: 700 }}>WESTCHESTER COUNTY</span>
        <span style={{ fontSize: 70, fontWeight: 700, letterSpacing: -3, lineHeight: 1.11, marginTop: 23 }}>Shared direct mail.</span>
        <span style={{ fontSize: 70, fontWeight: 700, letterSpacing: -3, lineHeight: 1.11 }}>Local businesses.</span>
        <span style={{ fontSize: 28, color: "#5f5b53", marginTop: 27 }}>Explore postcard advertising areas with Inside914.</span>
      </div>
      <div style={{ display: "flex", width: "100%", height: 10, background: "#1f5c4a", borderRadius: 8 }} />
    </div>,
    size,
  );
}
