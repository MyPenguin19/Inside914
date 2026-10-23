import { POSTCARD_LAYOUT_V2, regionToTrim } from "@/lib/print/layouts";
import { boxStyle } from "@/components/postcard/postcard-side";

const TILES = [
  { tone: "bg-accent text-white", title: "Your Business Here" },
  { tone: "bg-[#f4efe4] text-foreground", title: "Local Bakery" },
  { tone: "bg-info text-white", title: "Home Services" },
  { tone: "bg-[#efe7dc] text-foreground", title: "Family Dentist" },
  { tone: "bg-[#c9803a] text-white", title: "Pizza Night" },
  { tone: "bg-[#e6ece9] text-foreground", title: "Yoga Studio" },
];
const front = POSTCARD_LAYOUT_V2.paidSlots.filter(s => s.side === "front").map(r => regionToTrim(POSTCARD_LAYOUT_V2, r));

// Illustration uses the same physical front as booking/export, without inventing extra slots.
export function PostcardIllustration() {
  return <figure className="mx-auto w-full max-w-[460px]">
    <div className="relative">
      <div aria-hidden="true" className="absolute inset-0 translate-x-3 translate-y-3 rotate-[3deg] rounded border border-line bg-surface shadow-md" />
      <div role="img" aria-label="Illustration of the shared Inside914 postcard with six front advertising spaces" className="relative -rotate-2 rounded border border-line bg-paper shadow-xl" style={{aspectRatio:"9 / 6"}}>
        {front.map((slot,i)=><div key={slot.label} className={`absolute flex flex-col justify-end p-[2%] ${TILES[i].tone}`} style={boxStyle(slot,POSTCARD_LAYOUT_V2.trim)}>
          <span className="font-display text-[clamp(10px,2.8vw,17px)] font-medium leading-tight">{TILES[i].title}</span>
          <span className="mt-1 text-[10px] opacity-80">{slot.label} · Sample ad</span>
        </div>)}
      </div>
    </div>
    <figcaption className="mt-6 text-center text-xs text-muted">Front illustration · Six front and four back ads · Layout varies by campaign</figcaption>
  </figure>;
}
export function SizeDiagram() {
  return <div aria-hidden="true" className="relative w-24 shrink-0 rounded border border-line-strong bg-paper" style={{aspectRatio:"9 / 6"}}>
    {front.map((slot,i)=><div key={slot.label} className={`absolute ${i===1 ? "bg-accent" : "bg-reserved"}`} style={boxStyle(slot,POSTCARD_LAYOUT_V2.trim)} />)}
  </div>;
}
