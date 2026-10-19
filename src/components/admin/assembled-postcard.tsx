import { AMAZINGMAIL_9X6_LAYOUT, fileToTrim } from "@/lib/print/amazingmail-layout";
import { CroppedImage } from "@/components/artwork/cropped-image";
import { boxStyle } from "@/components/postcard/postcard-side";
import type { AdminSlot } from "@/lib/admin/metrics";
import { adArea } from "@/lib/artwork/rules";
import type { ArtworkView } from "@/lib/artwork/service";
import { POSTCARD_INCHES } from "@/lib/booking/selection";

export type Placement = { slots: AdminSlot[]; business: string; artwork: ArtworkView | null; approved: boolean };

// One side of the postcard with every reserved ad in its place, using the same slot geometry and
// cropping as everywhere else (no second layout engine). Anything not content-approved is shown
// as a warning tile, never as if it were ready.
export function AssembledSide({ side, slots, placements, square = false, dimensions = POSTCARD_INCHES }: { square?: boolean; dimensions?: { width: number; height: number }; side: "front" | "back"; slots: AdminSlot[]; placements: Placement[] }) {
  const own = placements.map(p => ({ ...p, slots: p.slots.filter(s => s.side === side) })).filter(p => p.slots.length > 0);
  const taken = new Set(own.flatMap((p) => p.slots.map((s) => s.id)));
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-medium">{side === "front" ? "Front" : "Back"}</figcaption>
      <div
        role="img"
        aria-label={`Assembled ${side} of the postcard (not a print proof)`}
        className="relative w-full overflow-hidden rounded-[6px] border border-line-strong/70 bg-paper"
        style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
      >
        {slots
          .filter((s) => s.side === side && !taken.has(s.id))
          .map((s) => (
            <div key={s.id} aria-hidden="true" className="absolute p-[1.5%]" style={boxStyle(s, dimensions)}>
              <div className="flex h-full w-full items-center justify-center rounded-[3px] border border-dashed border-line-strong text-[10px] text-muted">
                {s.blockedAt ? "Blocked" : `${s.label} unsold`}
              </div>
            </div>
          ))}
        {square && side === "back" && <>
          {AMAZINGMAIL_9X6_LAYOUT.houseRegions.map(region => <div key={region.id} className="absolute flex items-center justify-center border border-dashed border-line-strong bg-background-soft p-1 text-center text-[10px] text-muted" style={boxStyle(fileToTrim(region), dimensions)}>
            {region.id === "inside914" ? "Inside914" : "Inside Diagnostics"} · House artwork pending
          </div>)}
          <div className="absolute flex items-center justify-center bg-background-soft p-2 text-center text-[10px] text-muted" style={boxStyle(fileToTrim(AMAZINGMAIL_9X6_LAYOUT.postal), dimensions)}>Postal exclusion · No advertising</div>
        </>}
        {own.map((p) => {
          const area = adArea(p.slots);
          return (
            <div key={p.slots.map((s) => s.id).join()} className="absolute" style={boxStyle(area, dimensions)}>
              {p.artwork?.crop && p.approved ? (
                <CroppedImage src={p.artwork.viewUrl} imageWidth={p.artwork.width} imageHeight={p.artwork.height} crop={p.artwork.crop} alt={`${p.business} ad`} />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-warning-soft p-1 text-center text-[10px] leading-tight text-warning">
                  <span className="font-semibold">{p.business}</span>
                  <span>{!p.artwork ? "Artwork missing" : p.artwork.crop ? "Not approved yet" : "Not positioned"}</span>
                </div>
              )}
            </div>
          );
        })}
        <span aria-hidden="true" className="pointer-events-none absolute bottom-1 right-1 rounded bg-foreground/70 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-background">
          Not a print proof
        </span>
      </div>
    </figure>
  );
}
