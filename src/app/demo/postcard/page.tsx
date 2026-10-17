"use client";

import { BookingSteps } from "@/components/booking/booking-steps";
import { PostcardBooking } from "@/components/booking/postcard-booking";
import { useDemoStore } from "@/components/demo/demo-store";
import { DEMO_EDITION } from "@/lib/demo/data";
import { formatDeadline, formatHouseholds, formatIssueMonth } from "@/lib/format";

// Same selection component as the real booking page, fed with sample inventory. "Holding" here
// only remembers the choice in this browser tab.
export default function DemoPostcardPage() {
  const { setSelection, setArtwork } = useDemoStore();

  async function holdSelection({ slotIds }: { editionId: string; slotIds: string[] }) {
    const chosen = DEMO_EDITION.slots.filter((s) => slotIds.includes(s.id));
    const double = slotIds.length === 2;
    setSelection({
      slotIds,
      side: chosen[0].side,
      size: double ? "double" : "standard",
      priceCents: double ? DEMO_EDITION.doublePriceCents! : DEMO_EDITION.unitPriceCents,
      holdExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
    setArtwork(null);
    return { ok: true as const };
  }

  return (
    <div>
      <BookingSteps current={2} />
      <header className="mt-8 border-b border-line pb-6">
        <p className="text-sm text-muted">{formatIssueMonth(DEMO_EDITION.issueMonth)} edition · sample inventory</p>
        <h1 className="mt-1 font-display text-4xl font-medium tracking-tight">{DEMO_EDITION.zoneName}</h1>
        <p className="mt-3 text-muted">
          Planned mailing: <strong className="text-foreground">≈ {formatHouseholds(DEMO_EDITION.households)} homes</strong> · Reserve by{" "}
          {formatDeadline(DEMO_EDITION.artworkDeadline)}
        </p>
      </header>
      <div className="mt-8">
        <PostcardBooking catalog={DEMO_EDITION} holdSelection={holdSelection} nextHref="/demo/artwork" />
      </div>
    </div>
  );
}
