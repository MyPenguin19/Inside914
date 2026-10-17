import { POSTCARD_INCHES, type CatalogSlot, type Side } from "@/lib/booking/selection";
import { formatPrice } from "@/lib/format";

export type SlotView = { slot: CatalogSlot; selected: boolean; selectable: boolean; note: string };

// Non-ad areas printed on the card (masthead, mailing panel). Geometry in inches, like slots, so a
// layout is pure data; none are required.
export type PostcardZone = {
  side: Side;
  kind: "masthead" | "mailing";
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  detail?: string;
};

type Props = {
  side: Side;
  views: SlotView[];
  priceCents: number | null;
  onSelect: (slotId: string) => void;
  zones?: PostcardZone[];
  caption?: boolean;
};

const pct = (value: number, of: number) => `${(value / of) * 100}%`;

export const boxStyle = (b: { x: number; y: number; width: number; height: number }) => ({
  left: pct(b.x, POSTCARD_INCHES.width),
  top: pct(b.y, POSTCARD_INCHES.height),
  width: pct(b.width, POSTCARD_INCHES.width),
  height: pct(b.height, POSTCARD_INCHES.height),
});

// When two side-by-side units are selected (double ad), draw them as one merged space.
function mergedBox(views: SlotView[]) {
  const chosen = views.filter((v) => v.selected).map((v) => v.slot);
  if (chosen.length !== 2) return null;
  const x = Math.min(...chosen.map((s) => s.x));
  const y = Math.min(...chosen.map((s) => s.y));
  return {
    x,
    y,
    width: Math.max(...chosen.map((s) => s.x + s.width)) - x,
    height: Math.max(...chosen.map((s) => s.y + s.height)) - y,
    labels: chosen.map((s) => s.label).join(" + "),
  };
}

// One face of the postcard, drawn to scale from slot geometry (inches) in the database.
export function PostcardSide({ side, views, priceCents, onSelect, zones = [], caption = true }: Props) {
  const title = side === "front" ? "Front" : "Back";
  const merged = mergedBox(views);
  return (
    <figure className="flex flex-col gap-2">
      {caption && <figcaption className="text-sm font-medium">{title}</figcaption>}
      <div
        role="group"
        aria-label={`${title} of the postcard`}
        className="relative w-full rounded-[6px] border border-line-strong/70 bg-paper shadow-[0_1px_2px_rgba(28,27,25,0.06),0_24px_48px_-28px_rgba(28,27,25,0.45)]"
        style={{ aspectRatio: `${POSTCARD_INCHES.width} / ${POSTCARD_INCHES.height}` }}
      >
        {zones
          .filter((z) => z.side === side)
          .map((zone) => (
            <Zone key={zone.kind + zone.y} zone={zone} />
          ))}
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
            className="group absolute p-[2.5%] focus-visible:outline-none"
            style={boxStyle(slot)}
          >
            <span
              className={`relative flex h-full w-full flex-col items-center justify-center rounded-[4px] border text-center transition-[background-color,border-color,box-shadow] group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2 ${
                selected
                  ? "border-accent bg-accent text-white shadow-md"
                  : selectable
                    ? "border-dashed border-line-strong bg-surface text-foreground group-hover:border-solid group-hover:border-accent group-hover:bg-accent-soft group-active:bg-accent-soft"
                    : slot.available
                      ? "cursor-not-allowed border-line bg-background-soft text-muted" // open, but not in this size
                      : "cursor-not-allowed border-transparent bg-[repeating-linear-gradient(135deg,var(--reserved),var(--reserved)_6px,var(--line)_6px,var(--line)_7px)] text-muted"
              }`}
            >
              <span className="absolute left-2 top-1.5 text-[10px] font-semibold tracking-wide opacity-70">{slot.label}</span>
              <span aria-hidden="true" className="text-xs font-medium sm:text-[13px]">
                {selected ? "✓ Your ad" : note}
              </span>
              {selectable && !selected && priceCents !== null && (
                <span aria-hidden="true" className="mt-0.5 text-[11px] text-muted group-hover:text-accent">
                  {formatPrice(priceCents)}
                </span>
              )}
            </span>
          </button>
        ))}
        {merged && (
          <div aria-hidden="true" className="pointer-events-none absolute p-[1.5%]" style={boxStyle(merged)}>
            <div className="flex h-full w-full flex-col items-center justify-center rounded-[4px] bg-accent text-center text-white shadow-lg ring-1 ring-accent">
              <span className="text-[13px] font-semibold">✓ Your double ad</span>
              <span className="mt-0.5 text-[11px] opacity-85">{merged.labels}</span>
            </div>
          </div>
        )}
      </div>
    </figure>
  );
}

// Printed, non-selectable areas. Text is decorative: the slots carry the meaning for assistive tech.
function Zone({ zone }: { zone: PostcardZone }) {
  if (zone.kind === "masthead") {
    return (
      <div aria-hidden="true" className="absolute flex flex-col justify-center px-[5%]" style={boxStyle(zone)}>
        <div className="flex items-end justify-between gap-2 border-b-2 border-foreground pb-[3%]">
          <span className="font-display text-[clamp(1rem,5vw,1.6rem)] font-semibold leading-none tracking-tight">
            Inside<span className="text-accent">914</span>
          </span>
          <span className="text-right text-[10px] leading-tight text-muted">{zone.detail}</span>
        </div>
        <span className="mt-[2%] text-[10px] uppercase tracking-[0.16em] text-muted">{zone.title}</span>
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="absolute p-[2.5%]" style={boxStyle(zone)}>
      <div className="relative flex h-full w-full gap-[4%] rounded-[4px] border border-line bg-surface/60 p-[4%]">
        <div className="flex flex-1 flex-col justify-between">
          <div className="space-y-1">
            <span className="block font-display text-sm font-semibold leading-none">
              Inside<span className="text-accent">914</span>
            </span>
            <span className="block text-[9px] leading-tight text-muted">{zone.detail}</span>
          </div>
          <div className="space-y-1.5 self-center" style={{ width: "70%" }}>
            <span className="block text-[9px] uppercase tracking-wider text-muted">{zone.title}</span>
            <span className="block h-1.5 w-full rounded-full bg-line" />
            <span className="block h-1.5 w-4/5 rounded-full bg-line" />
            <span className="block h-1.5 w-3/5 rounded-full bg-line" />
          </div>
        </div>
        <span className="flex h-[38%] w-[20%] items-center justify-center rounded-[2px] border border-dashed border-line-strong text-center text-[8px] leading-tight text-muted">
          Postage
        </span>
      </div>
    </div>
  );
}
