"use client";

import { PostcardBooking } from "@/components/booking/postcard-booking";
import { useDemoStore } from "@/components/demo/demo-store";
import { DemoSteps } from "@/components/demo/demo-steps";
import { DEMO_EDITION, DEMO_ZONES } from "@/lib/demo/data";
import { formatDeadline, formatHouseholds, formatIssueMonth } from "@/lib/format";

// Same selection component as the real booking page, fed with sample inventory. "Holding" here
// only remembers the choice in this browser tab.
export default function DemoPostcardPage() {
  const { selection, setSelection, setArtwork } = useDemoStore();

  async function holdSelection({ slotIds }: { editionId: string; slotIds: string[] }) {
    const chosen = DEMO_EDITION.slots.filter((s) => slotIds.includes(s.id));
    const double = slotIds.length === 2;
    const unchanged = selection?.slotIds.join() === slotIds.join();
    setSelection({
      slotIds,
      side: chosen[0].side,
      size: double ? "double" : "standard",
      priceCents: double ? DEMO_EDITION.doublePriceCents! : DEMO_EDITION.unitPriceCents,
      holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    if (!unchanged) setArtwork(null); // artwork is cropped to a size, so a new space starts fresh
    return { ok: true as const };
  }

  return (
    <div>
      <DemoSteps current={2} />
      <header className="mt-8">
        <h1 className="font-display text-4xl font-medium tracking-tight">Choose your space</h1>
        <p className="mt-2 text-muted">
          {DEMO_EDITION.zoneName} · {formatIssueMonth(DEMO_EDITION.issueMonth)} · ≈ {formatHouseholds(DEMO_EDITION.households)} homes ·
          Reserve by {formatDeadline(DEMO_EDITION.artworkDeadline)}
        </p>
      </header>
      <div className="mt-8">
        <PostcardBooking
          // Remount once the saved choice is read from this tab, so going back shows it selected.
          key={selection ? selection.slotIds.join() : "new"}
          catalog={DEMO_EDITION}
          holdSelection={holdSelection}
          nextHref="/demo/artwork"
          continueLabel="Continue"
          initialSelected={selection?.slotIds}
          zones={DEMO_ZONES}
        />
      </div>
    </div>
  );
}
