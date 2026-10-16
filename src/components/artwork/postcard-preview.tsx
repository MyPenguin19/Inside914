import type { ReactNode } from "react";
import type { SlotGeometry } from "@/lib/artwork/rules";
import { POSTCARD_INCHES } from "@/lib/booking/selection";
import { PRINT_SPEC } from "@/lib/print/spec";

type Props = {
  side: "front" | "back";
  otherSlots: SlotGeometry[]; // positions belonging to other advertisers on this side
  area: SlotGeometry; // the customer's ad (one slot, or the union of a double)
  showSafeArea?: boolean;
  compact?: boolean; // thumbnail: no caption
  children: ReactNode; // what to draw inside the ad area
};

const pct = (value: number, of: number) => `${(value / of) * 100}%`;

// The whole front or back of the postcard, to scale, with the customer's ad in its position.
export function PostcardPreview({ side, otherSlots, area, showSafeArea = true, compact = false, children }: Props) {
  const inset = PRINT_SPEC.safeMarginInches;
  return (
    <figure className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`Preview of the ${side} of the postcard with your ad in place`}
        className="relative w-full overflow-hidden rounded-lg border border-line bg-surface shadow-sm"
        style={{ aspectRatio: `${POSTCARD_INCHES.width} / ${POSTCARD_INCHES.height}` }}
      >
        {otherSlots.map((slot, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="absolute p-[2%]"
            style={{
              left: pct(slot.x, POSTCARD_INCHES.width),
              top: pct(slot.y, POSTCARD_INCHES.height),
              width: pct(slot.width, POSTCARD_INCHES.width),
              height: pct(slot.height, POSTCARD_INCHES.height),
            }}
          >
            <div className="h-full w-full rounded-sm bg-[#efece5]" />
          </div>
        ))}
        {/* No padding here: the ad box must keep the exact aspect ratio of the ad area. */}
        <div
          className="absolute"
          style={{
            left: pct(area.x, POSTCARD_INCHES.width),
            top: pct(area.y, POSTCARD_INCHES.height),
            width: pct(area.width, POSTCARD_INCHES.width),
            height: pct(area.height, POSTCARD_INCHES.height),
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
