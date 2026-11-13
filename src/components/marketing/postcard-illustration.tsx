import { POSTCARD_LAYOUT_V2, regionToTrim } from "@/lib/print/layouts";
import { boxStyle } from "@/components/postcard/postcard-side";
import { BrandMark } from "@/components/brand-mark";
import { InteractivePostcard } from "@/components/marketing/interactive-postcard";

const TILES = [
  { tone: "bg-accent-soft text-accent", title: "Your Business Here", detail: "Made for your neighborhood", initial: "Y" },
  { tone: "bg-warning-soft text-warning", title: "Local Bakery", detail: "Fresh from the oven", initial: "B" },
  { tone: "bg-info-soft text-info", title: "Home Services", detail: "Care for your home", initial: "H" },
  { tone: "bg-background-soft text-foreground", title: "Family Dentist", detail: "A reason to smile", initial: "D" },
  { tone: "bg-danger-soft text-danger", title: "Pizza Night", detail: "Your local favorite", initial: "P" },
  { tone: "bg-accent-soft text-accent", title: "Yoga Studio", detail: "Room to slow down", initial: "Y" },
];
const front = POSTCARD_LAYOUT_V2.paidSlots.filter(s => s.side === "front").map(r => regionToTrim(POSTCARD_LAYOUT_V2, r));
const back = POSTCARD_LAYOUT_V2.paidSlots.filter(s => s.side === "back").map(r => regionToTrim(POSTCARD_LAYOUT_V2, r));
const house = regionToTrim(POSTCARD_LAYOUT_V2, POSTCARD_LAYOUT_V2.housePanel);
const postalWithBleed = regionToTrim(POSTCARD_LAYOUT_V2, POSTCARD_LAYOUT_V2.postal);
// The mailing region includes bleed; the sample shows the finished, trimmed card.
const postal = {
  ...postalWithBleed,
  width: Math.min(postalWithBleed.width, POSTCARD_LAYOUT_V2.trim.width - postalWithBleed.x),
  height: Math.min(postalWithBleed.height, POSTCARD_LAYOUT_V2.trim.height - postalWithBleed.y),
};

// Both sample faces use the same physical layout as booking/export.
export function PostcardIllustration() {
  return <InteractivePostcard front={<SampleFace side="front" />} back={<SampleFace side="back" />} />;
}

function SampleFace({ side }: { side: "front" | "back" }) {
  const slots = side === "front" ? front : back;
  return (
    <div className="rounded-xl border border-line bg-paper p-[2%] shadow-xl">
      <div
        role="img"
        aria-label={side === "front" ? "Front of the sample postcard: six advertising spaces" : "Back of the sample postcard: four advertising spaces, an Inside914 panel and a mailing panel"}
        className="relative overflow-hidden rounded [container-type:inline-size]"
        style={{ aspectRatio: `${POSTCARD_LAYOUT_V2.trim.width} / ${POSTCARD_LAYOUT_V2.trim.height}` }}
      >
        {slots.map((slot, i) => (
          <div key={slot.label} data-sample-slot={slot.label} className={`absolute flex flex-col justify-between rounded border border-current/10 p-[2%] ${TILES[i].tone}`} style={boxStyle(slot, POSTCARD_LAYOUT_V2.trim)}>
            <div className="flex items-center justify-between gap-1">
              <span className="flex size-[5cqw] shrink-0 items-center justify-center rounded-full border border-current/25 text-[2.6cqw] font-semibold">{TILES[i].initial}</span>
              <span className="text-[2cqw] leading-tight">{slot.label} · Sample ad</span>
            </div>
            <div>
              <span className="mb-[2cqw] block h-[0.6cqw] w-[25%] rounded-full bg-current opacity-50" />
              <span className={`block font-display font-medium leading-tight ${side === "front" ? "text-[3.5cqw]" : "text-[3cqw]"}`}>{TILES[i].title}</span>
              <span className="mt-[1cqw] block text-[2.1cqw] leading-snug">{TILES[i].detail}</span>
            </div>
          </div>
        ))}
        {side === "back" && (
          <>
            <div data-sample-region="house" className="absolute flex flex-col justify-between rounded border border-accent/20 bg-accent-soft p-[3%]" style={boxStyle(house, POSTCARD_LAYOUT_V2.trim)}>
              <BrandMark className="text-[4cqw]" />
              <span className="text-[2.6cqw] leading-snug text-accent">Local businesses.<br />One shared postcard.</span>
              <span className="text-[1.8cqw] uppercase tracking-wider text-accent">Inside914 panel</span>
            </div>
            <div data-sample-region="postal" className="absolute flex flex-col justify-between rounded border border-dashed border-line-strong bg-surface p-[3%]" style={boxStyle(postal, POSTCARD_LAYOUT_V2.trim)}>
              <div className="flex items-start justify-between gap-[2cqw]">
                <span className="text-[2.2cqw] font-medium text-muted">Mailing panel</span>
                <span className="flex h-[9cqw] w-[7cqw] shrink-0 items-center justify-center border border-line-strong bg-background-soft text-[1.7cqw] text-muted">Postage</span>
              </div>
              <div className="space-y-[1.5cqw]">
                <span className="block h-[0.7cqw] w-4/5 rounded-full bg-line" />
                <span className="block h-[0.7cqw] w-3/5 rounded-full bg-line" />
                <span className="block h-[0.7cqw] w-2/3 rounded-full bg-line" />
              </div>
              <span className="text-[1.8cqw] uppercase tracking-wider text-muted">Reserved for mailing</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
export function SizeDiagram() {
  return <div aria-hidden="true" className="relative w-24 shrink-0 rounded border border-line-strong bg-paper" style={{aspectRatio:"9 / 6"}}>
    {front.map((slot,i)=><div key={slot.label} className={`absolute ${i===1 ? "bg-accent" : "bg-reserved"}`} style={boxStyle(slot,POSTCARD_LAYOUT_V2.trim)} />)}
  </div>;
}
