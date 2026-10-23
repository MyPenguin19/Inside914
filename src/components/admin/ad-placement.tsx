import { placementDimensions } from "@/lib/print/layouts";
import { CroppedImage } from "@/components/artwork/cropped-image";
import { PostcardPreview } from "@/components/artwork/postcard-preview";
import { OriginalArtwork } from "./original-artwork";
import { assessArtworkQuality } from "@/lib/artwork/review-quality";
import type { AdminSlot } from "@/lib/admin/metrics";
import { adArea } from "@/lib/artwork/rules";
import type { ArtworkView } from "@/lib/artwork/service";

// The advertiser's artwork: cropped ad in its place on the postcard, the resolution check, and a
// link to the original upload. viewUrl is a short-lived signed URL (private bucket).
export function AdPlacement({ artwork, own, slots, dimensions, layoutKey }: { layoutKey?: string | null; dimensions?: {width:number; height:number}; artwork: ArtworkView; own: AdminSlot[]; slots: AdminSlot[] }) {
  if (new Set(own.map(s => s.side)).size > 1) return <div className="grid gap-4">
    {(["front", "back"] as const).map(side => <AdPlacement layoutKey={layoutKey} key={side} dimensions={dimensions} artwork={artwork} own={own.filter(s => s.side === side)} slots={slots} />)}
  </div>;
  const area = adArea(own);
  const quality = assessArtworkQuality(artwork, artwork.crop, area);
  return (
    <div className="flex flex-col gap-3">
      <OriginalArtwork src={artwork.viewUrl} />
      <h2 className="text-sm font-medium">Print placement · {area.side === "front" ? "Front" : "Back"}</h2>
      <div className="mx-auto w-full max-w-[260px]">
        <PostcardPreview layoutKey={layoutKey} dimensions={dimensions} side={area.side} otherSlots={slots.filter((s) => s.side === area.side && !own.some((o) => o.id === s.id))} area={area}>
          {artwork.crop ? (
            <CroppedImage target={area} src={artwork.viewUrl} imageWidth={artwork.width} imageHeight={artwork.height} crop={artwork.crop} alt="The advertiser's ad on the postcard" />
          ) : (
            <div className="flex h-full items-center justify-center bg-warning-soft p-2 text-center text-xs text-warning">Not positioned yet</div>
          )}
        </PostcardPreview>
      </div>
      <p className="text-sm">Printed ad: {placementDimensions(area)}</p>
      {quality ? <div className="rounded-xl bg-background-soft p-3 text-sm" role="note" aria-label="Artwork resolution review">
        <p className="font-medium">{quality.status} · {quality.ppi} effective PPI</p>
        <p className="mt-1">{quality.status === "PASS" ? "Meets the internal 300 PPI target. Inspect the artwork and printer proof before approving." : quality.status === "REVIEW" ? "Potential softness. Request higher-resolution artwork or explicit printer acceptance before print approval." : "Low resolution. Replacement artwork or documented printer acceptance of an actual proof is required."}</p>
        <p className="mt-2">For this contained placement at 300 PPI: at least {quality.minimumPixels.width} × {quality.minimumPixels.height} crop pixels. Do not upscale to meet this target.</p>
        <p className="mt-2 text-xs text-muted">This is a quality check, not content or print approval. An 800-DPI export does not add source detail.</p>
      </div> : <p role="note" className="text-sm text-warning">Quality cannot be assessed until a valid crop and source dimensions are available.</p>}
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted">Saved crop</dt>
          <dd>{artwork.crop ? `${artwork.crop.width} × ${artwork.crop.height} px` : "Not positioned"}</dd>
        </div>
        <div>
          <dt className="text-muted">Contained image size</dt>
          <dd>{quality ? `${Number(quality.printed.width.toFixed(4))}″ × ${Number(quality.printed.height.toFixed(4))}″` : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">Original</dt>
          <dd>
            {artwork.width} × {artwork.height} px · {artwork.contentType.replace("image/", "").toUpperCase()}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Zoom</dt>
          <dd>{artwork.zoom ? `${Math.round(artwork.zoom * 100)}%` : "—"}</dd>
        </div>
      </dl>
      <a href={artwork.viewUrl} target="_blank" rel="noreferrer noopener" className="text-sm underline-offset-4 hover:underline">
        Open original upload (link expires shortly)
      </a>
    </div>
  );
}
