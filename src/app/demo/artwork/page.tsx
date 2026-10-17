"use client";

import { useMemo, useRef } from "react";
import { ArtworkStudio, type ArtworkActions } from "@/components/artwork/artwork-studio";
import { useDemoStore } from "@/components/demo/demo-store";
import { DemoSteps } from "@/components/demo/demo-steps";
import { NeedSelection } from "@/components/demo/need-selection";
import { inspectFile } from "@/lib/artwork/browser-file";
import { adArea } from "@/lib/artwork/rules";
import { DEMO_EDITION, DEMO_ZONES } from "@/lib/demo/data";

// The real artwork editor with local-only actions: the image never leaves this browser.
export default function DemoArtworkPage() {
  const { selection, artwork, setArtwork } = useDemoStore();
  const lastInspected = useRef<{ src: string; width: number; height: number } | null>(null);

  const actions: ArtworkActions = useMemo(
    () => ({
      requestUpload: async () => ({ ok: true, artworkId: "preview-artwork", uploadUrl: "local-preview" }),
      finalizeUpload: async () => {
        const img = lastInspected.current!;
        setArtwork({ src: img.src, width: img.width, height: img.height, crop: null, zoom: 1 });
        return {
          ok: true,
          artwork: { id: "preview-artwork", contentType: "image/png", width: img.width, height: img.height, viewUrl: img.src, crop: null, zoom: null },
        };
      },
      saveLayout: async ({ crop, zoom }) => {
        const img = lastInspected.current ?? (artwork && { src: artwork.src, width: artwork.width, height: artwork.height });
        if (img) setArtwork({ ...img, crop, zoom });
        return { ok: true };
      },
      removeArtwork: async () => {
        setArtwork(null);
        return { ok: true };
      },
      extendHold: async () => ({ ok: true, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() }),
    }),
    [artwork, setArtwork],
  );

  if (!selection) return <NeedSelection />;
  const own = DEMO_EDITION.slots.filter((s) => selection.slotIds.includes(s.id));
  const area = adArea(own);

  return (
    <div>
      <DemoSteps current={3} />
      <header className="mb-6 mt-6">
        <h1 className="font-display text-4xl font-medium tracking-tight">Add your artwork</h1>
        <p className="mt-2 text-muted">
          Upload your ad, then drag and zoom until it looks right. In this preview your image stays on your device.
        </p>
      </header>
      <ArtworkStudio
        hold={{ expiresAt: selection.holdExpiresAt, extensionsLeft: 2 }}
        ad={{ side: area.side, area, labels: own.map((s) => s.label), size: selection.size, priceCents: selection.priceCents }}
        otherSlots={DEMO_EDITION.slots.filter((s) => s.side === area.side && !selection.slotIds.includes(s.id))}
        initialArtwork={
          artwork
            ? { id: "preview-artwork", contentType: "image/png", width: artwork.width, height: artwork.height, viewUrl: artwork.src, crop: artwork.crop, zoom: artwork.zoom }
            : null
        }
        actions={actions}
        nextHref="/demo/checkout"
        restartHref="/demo/postcard"
        zones={DEMO_ZONES}
        upload={async (_url, _file, _type, options) => {
          for (const step of [0.35, 0.7, 1]) {
            await new Promise((r) => setTimeout(r, 120));
            options?.onProgress?.(step);
          }
        }}
        inspect={async (file) => {
          const result = await inspectFile(file);
          if (result.ok) lastInspected.current = { src: result.previewUrl, width: result.width, height: result.height };
          return result;
        }}
      />
    </div>
  );
}
