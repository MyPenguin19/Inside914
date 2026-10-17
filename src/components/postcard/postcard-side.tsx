import { POSTCARD_INCHES, type CatalogSlot, type Side } from "@/lib/booking/selection";
import { formatPrice } from "@/lib/format";

export type SlotView = { slot: CatalogSlot; selected: boolean; selectable: boolean; note: string };

type Props = {
  side: Side;
  views: SlotView[];
  priceCents: number | null;
  onSelect: (slotId: string) => void;
};

const pct = (value: number, of: number) => `${(value / of) * 100}%`;

// When two side-by-side units are selected (double ad), draw them as one merged space.
function mergedBox(views: SlotView[]) {
  const chosen = views.filter((v) => v.selected).map((v) => v.slot);
  if (chosen.length !== 2) return null;
  const left = Math.min(...chosen.map((s) => s.x));
  const top = Math.min(...chosen.map((s) => s.y));
  return {
    left,
    top,
    width: Math.max(...chosen.map((s) => s.x + s.width)) - left,
    height: Math.max(...chosen.map((s) => s.y + s.height)) - top,
    labels: chosen.map((s) => s.label).join(" + "),
  };
}

// One face of the postcard, drawn to scale from slot geometry (inches) in the database.
export function PostcardSide({ side, views, priceCents, onSelect, caption = true }: Props & { caption?: boolean }) {
  const title = side === "front" ? "Front" : "Back";
  const merged = mergedBox(views);
  return (
    <figure className="flex flex-col gap-2">
      {caption && <figcaption className="text-sm font-medium">{title}</figcaption>}
      <div
        role="group"
        aria-label={`${title} of the postcard`}
        className="relative w-full rounded-[10px] border border-line bg-surface shadow-[0_18px_40px_-22px_rgba(28,27,25,0.45)]"
        style={{ aspectRatio: `${POSTCARD_INCHES.width} / ${POSTCARD_INCHES.height}` }}
      >
        {views.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-muted">
            No ad positions on this side.
          </p>
        )}
        {views.map(({ slot, selected, selectable, note }) => (
          <button
            key={slot.id}
            type="button"
            data-slot-label={slot.label}
            aria-pressed={selected}
            disabled={!selectable && !selected}
            onClick={() => onSelect(slot.id)}
            aria-label={`${title} position ${slot.label}: ${note}${
              selectable && priceCents !== null && !selected ? `, ${formatPrice(priceCents)}` : ""
            }`}
            className="group absolute p-[3%] focus-visible:outline-none"
            style={{
              left: pct(slot.x, POSTCARD_INCHES.width),
              top: pct(slot.y, POSTCARD_INCHES.height),
              width: pct(slot.width, POSTCARD_INCHES.width),
              height: pct(slot.height, POSTCARD_INCHES.height),
            }}
          >
            <span
              className={`flex h-full w-full flex-col items-center justify-center rounded-md border text-center text-xs transition-colors group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2 ${
                selected
                  ? "border-accent bg-accent text-white"
                  : selectable
                    ? "border-line bg-background hover:border-accent hover:bg-accent-soft"
                    : slot.available
                      ? "cursor-not-allowed border-line bg-background-soft text-muted" // open, but not in this size
                      : "cursor-not-allowed border-dashed border-line bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,#efece5_6px,#efece5_12px)] text-muted"
              }`}
            >
              <span className="font-semibold">{slot.label}</span>
              <span aria-hidden="true" className="mt-0.5 text-[11px] leading-tight opacity-90">
                {note}
              </span>
            </span>
          </button>
        ))}
        {merged && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute p-[2%]"
            style={{
              left: pct(merged.left, POSTCARD_INCHES.width),
              top: pct(merged.top, POSTCARD_INCHES.height),
              width: pct(merged.width, POSTCARD_INCHES.width),
              height: pct(merged.height, POSTCARD_INCHES.height),
            }}
          >
            <div className="flex h-full w-full flex-col items-center justify-center rounded-md bg-accent text-center text-xs text-white shadow-md">
              <span className="font-semibold">Double ad</span>
              <span className="mt-0.5 text-[11px] opacity-90">{merged.labels}</span>
            </div>
          </div>
        )}
      </div>
    </figure>
  );
}
