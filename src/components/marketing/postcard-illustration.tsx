// A decorative, clearly labeled ILLUSTRATION of the shared postcard (not real advertisers).
// Proportions follow the 6.5" x 12" card: masthead, then a provisional 2 x 4 grid of spaces.

const SAMPLE_TILES = [
  { tone: "bg-accent text-white", title: "Your Business Here", line: "Standard space" },
  { tone: "bg-[#f4efe4] text-foreground", title: "Local Bakery", line: "Sample ad" },
  { tone: "bg-info text-white", title: "Home Services", line: "Sample ad", wide: true },
  { tone: "bg-[#efe7dc] text-foreground", title: "Family Dentist", line: "Sample ad" },
  { tone: "bg-[#c9803a] text-white", title: "Pizza Night", line: "Sample ad" },
  { tone: "bg-[#e6ece9] text-foreground", title: "Yoga Studio", line: "Sample ad" },
  { tone: "bg-ink text-white", title: "Real Estate", line: "Sample ad" },
];

export function PostcardIllustration() {
  return (
    <figure className="relative mx-auto w-full max-w-[340px]">
      <div aria-hidden="true" className="absolute inset-0 translate-x-5 translate-y-4 rotate-[5deg] rounded-[10px] border border-line bg-surface shadow-md" />
      <div
        role="img"
        aria-label="Illustration of the shared Inside914 postcard with sample advertising spaces"
        className="relative flex -rotate-2 flex-col rounded-[6px] border border-line bg-paper p-[3.5%] shadow-[0_24px_60px_-20px_rgba(28,27,25,0.35)]"
        style={{ aspectRatio: "6.5 / 12" }}
      >
        <div className="mb-[3%] flex items-end justify-between border-b-2 border-foreground px-[2%] pb-[2.5%]">
          <span className="font-display text-[clamp(14px,4.6vw,22px)] font-semibold leading-none">
            Inside<span className="text-accent">914</span>
          </span>
          <span className="text-[clamp(7px,2vw,9px)] text-muted">Central Westchester</span>
        </div>
        <div className="grid flex-1 grid-cols-2 grid-rows-4 gap-[3%]">
          {SAMPLE_TILES.map((tile) => (
            <div
              key={tile.title}
              className={`flex flex-col justify-end rounded-[4px] p-[8%] ${tile.tone} ${tile.wide ? "col-span-2" : ""}`}
            >
              <span className="font-display text-[clamp(10px,3.4vw,15px)] leading-tight font-medium">{tile.title}</span>
              <span className="mt-0.5 text-[clamp(8px,2.4vw,10px)] opacity-80">{tile.line}</span>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-6 text-center text-xs text-muted">
        Illustration only: sample ads, provisional layout.
      </figcaption>
    </figure>
  );
}

// Mini diagrams for the pricing cards: one space vs two side-by-side spaces merged.
export function SizeDiagram({ size }: { size: "standard" | "double" }) {
  return (
    <div aria-hidden="true" className="grid w-24 shrink-0 grid-cols-2 grid-rows-4 gap-1 rounded-[4px] border border-line-strong bg-paper p-1.5" style={{ aspectRatio: "6.5 / 12" }}>
      {Array.from({ length: 8 }, (_, i) => {
        if (size === "double" && i === 3) return null;
        const highlighted = size === "standard" ? i === 2 : i === 2;
        return (
          <div
            key={i}
            className={`rounded-[2px] ${highlighted ? "bg-accent" : "bg-reserved"} ${size === "double" && i === 2 ? "col-span-2" : ""}`}
          />
        );
      })}
    </div>
  );
}
