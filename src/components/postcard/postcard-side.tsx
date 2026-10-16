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

// One face of the postcard, drawn to scale from slot geometry (inches) in the database.
export function PostcardSide({ side, views, priceCents, onSelect }: Props) {
  const title = side === "front" ? "Front" : "Back";
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div
        role="group"
        aria-label={`${title} of the postcard`}
        className="relative w-full rounded-lg border border-line bg-surface shadow-sm"
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
      </div>
    </figure>
  );
}
