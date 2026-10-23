import { findPostcardLayout, postcardZones } from "@/lib/print/layouts";
import type { ReactNode } from "react";
import type { SlotGeometry } from "@/lib/artwork/rules";
import { POSTCARD_INCHES } from "@/lib/booking/selection";
import { PRINT_SPEC } from "@/lib/print/spec";
import { boxStyle, type PostcardZone } from "@/components/postcard/postcard-side";

type Props = {
  layoutKey?: string | null;
  dimensions?: { width: number; height: number };
  side: "front" | "back";
  otherSlots: SlotGeometry[]; // positions belonging to other advertisers on this side
  area: SlotGeometry; // the customer's ad (one slot, or the union of a double)
  showSafeArea?: boolean;
  compact?: boolean; // thumbnail: no caption
  zones?: PostcardZone[]; // printed non-ad areas, drawn as quiet blocks
  children: ReactNode; // what to draw inside the ad area
};

const pct = (value: number, of: number) => `${(value / of) * 100}%`;

// The whole front or back of the postcard, to scale, with the customer's ad in its position.
export function PostcardPreview({ dimensions = POSTCARD_INCHES, side, otherSlots, area, showSafeArea = true, compact = false, zones = [], children, layoutKey }: Props) {
  const layout = findPostcardLayout(layoutKey);
  if (layout) { dimensions = layout.trim; zones = postcardZones(layoutKey); }
  const inset = PRINT_SPEC.safeMarginInches;
  return (
    <figure className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Preview of the ${side} of the postcard with your ad in place`}
        className="relative w-full overflow-hidden rounded-lg border border-line bg-surface shadow-sm"
        style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
      >
        {zones
          .filter((z) => z.side === side)
          .map((zone) => (
            <div key={zone.kind} aria-hidden="true" className={`absolute ${layout ? "" : "p-[2%]"}`} style={boxStyle(zone, dimensions)}>
              {zone.kind === "house" || zone.kind === "postal" ? <div className="flex h-full w-full items-center justify-center border border-line bg-background-soft p-1 text-center text-[9px] text-muted">{!compact && zone.title}</div> : zone.kind === "masthead" ? (
                <div className="flex h-full w-full items-end border-b border-foreground/40 pb-[4%]">
                  <span className="h-[22%] w-[34%] rounded-[1px] bg-foreground/30" />
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-sm border border-line bg-background-soft">
                  {!compact && <span className="text-[9px] text-muted">Mailing panel</span>}
                </div>
              )}
            </div>
          ))}
        {otherSlots.map((slot, i) => (
          <div
            key={i}
            aria-hidden="true"
            className={`absolute ${layout ? "" : "p-[2%]"}`}
            style={{
              left: pct(slot.x, dimensions.width),
              top: pct(slot.y, dimensions.height),
              width: pct(slot.width, dimensions.width),
              height: pct(slot.height, dimensions.height),
            }}
          >
            <div className="h-full w-full rounded-sm bg-reserved" />
          </div>
        ))}
        {/* No padding here: the ad box must keep the exact aspect ratio of the ad area. */}
        <div
          className="absolute"
          style={{
            left: pct(area.x, dimensions.width),
            top: pct(area.y, dimensions.height),
            width: pct(area.width, dimensions.width),
            height: pct(area.height, dimensions.height),
          }}
        >
          <div className="relative h-full w-full overflow-hidden rounded-sm ring-2 ring-accent">
            {children}
            {showSafeArea && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute border border-dashed border-white/90 mix-blend-difference"
                style={{
                  left: pct(inset, area.width),
                  right: pct(inset, area.width),
                  top: pct(inset, area.height),
                  bottom: pct(inset, area.height),
                }}
              />
            )}
          </div>
        </div>
      </div>
      <figcaption className={compact ? "sr-only" : "text-xs text-muted"}>
        {side === "front" ? "Front" : "Back"} of the postcard · your ad is outlined in green. Gray blocks are other local
        businesses.
      </figcaption>
    </figure>
  );
}
