import { CroppedImage } from "@/components/artwork/cropped-image";
import { PostcardPreview } from "@/components/artwork/postcard-preview";
import { QualityNote } from "@/components/artwork/artwork-studio";
import type { AdminSlot } from "@/lib/admin/metrics";
import { adArea, effectivePpi, resolutionLevel } from "@/lib/artwork/rules";
import type { ArtworkView } from "@/lib/artwork/service";

// The advertiser's artwork: cropped ad in its place on the postcard, the resolution check, and a
// link to the original upload. viewUrl is a short-lived signed URL (private bucket).
export function AdPlacement({ artwork, own, slots, dimensions }: { dimensions?: {width:number; height:number}; artwork: ArtworkView; own: AdminSlot[]; slots: AdminSlot[] }) {
  if (new Set(own.map(s => s.side)).size > 1) return <div className="grid gap-4">
    {(["front", "back"] as const).map(side => <AdPlacement key={side} dimensions={dimensions} artwork={artwork} own={own.filter(s => s.side === side)} slots={slots} />)}
  </div>;
  const area = adArea(own);
  const ppi = artwork.crop ? effectivePpi(artwork.crop, area) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="mx-auto w-full max-w-[260px]">
        <PostcardPreview dimensions={dimensions} side={area.side} otherSlots={slots.filter((s) => s.side === area.side && !own.some((o) => o.id === s.id))} area={area}>
          {artwork.crop ? (
            <CroppedImage src={artwork.viewUrl} imageWidth={artwork.width} imageHeight={artwork.height} crop={artwork.crop} alt="The advertiser's ad on the postcard" />
          ) : (
            <div className="flex h-full items-center justify-center bg-warning-soft p-2 text-center text-xs text-warning">Not positioned yet</div>
          )}
        </PostcardPreview>
      </div>
      <QualityNote ppi={ppi} level={ppi === null ? null : resolutionLevel(ppi)} />
      <dl className="grid grid-cols-2 gap-2 text-xs">
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
