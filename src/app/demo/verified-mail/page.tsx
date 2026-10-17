"use client";

import { CroppedImage } from "@/components/artwork/cropped-image";
import { PostcardPreview } from "@/components/artwork/postcard-preview";
import { demoReservationView } from "@/components/demo/demo-ad-view";
import { useDemoStore } from "@/components/demo/demo-store";
import { ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow, Notice, StatusBadge } from "@/components/ui/primitives";
import { Timeline, type TimelineStep } from "@/components/ui/timeline";
import { DEMO_EDITION, DEMO_ZONES } from "@/lib/demo/data";
import { formatDeadline, formatHouseholds, formatIssueMonth, formatPrice } from "@/lib/format";

// SAMPLE campaign stages for the design preview. Nothing here describes a real campaign.
const STAGES: TimelineStep[] = [
  { title: "Space reserved", state: "done", meta: "Sample date", description: "Your card is saved. Nothing charged." },
  { title: "Artwork approved", state: "done", meta: "Sample date", description: "Our team checked your ad for print." },
  { title: "Campaign fully booked", state: "current", description: "Waiting for every space on the postcard to be reserved." },
  { title: "Payment collected", state: "upcoming", description: "We charge your saved card once the campaign is approved." },
  { title: "Printing completed", state: "upcoming" },
  { title: "Submitted for mailing", state: "upcoming" },
  { title: "Mailing documentation available", state: "upcoming", description: "The documentation for your edition's mailing appears below." },
];

export default function DemoVerifiedMailPage() {
  const { selection, artwork, contact } = useDemoStore();
  const fallback = { slotIds: ["demo-F3"], side: "front" as const, size: "standard" as const, priceCents: DEMO_EDITION.unitPriceCents, holdExpiresAt: "" };
  const view = demoReservationView(selection ?? fallback, artwork, contact);

  return (
    <div className="flex flex-col gap-5">
      <Notice tone="warning" role="note">
        <strong>Demonstration data.</strong> Every stage, date and status on this page is a sample. No real campaign,
        payment or mailing is shown.
      </Notice>

      <header>
        <Eyebrow>Inside914 Verified Mail · Reference {view.reference}</Eyebrow>
        <h1 className="mt-3 font-display text-4xl font-medium tracking-tight">{view.businessName}</h1>
        <p className="mt-2 text-muted">
          Campaign: {view.zoneName}, {formatIssueMonth(view.issueMonth)} edition · ≈ {formatHouseholds(view.households)} homes planned
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Status at a glance (sample)">
        {[
          ["Reservation", "Reserved", "success"],
          ["Artwork", "Approved", "success"],
          ["Payment", "Not charged yet", "neutral"],
          ["Mailing", "Not mailed yet", "neutral"],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-4">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-2">
              <StatusBadge tone={tone as "success" | "neutral"}>{value}</StatusBadge>
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-5">
          <Card as="section">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-medium">Campaign progress</h2>
              <StatusBadge tone="info">Waiting for the postcard to fill (sample)</StatusBadge>
            </div>
            <div className="mt-6">
              <Timeline steps={STAGES} label="Campaign progress (sample)" />
            </div>
          </Card>

          <Card as="section">
            <h2 className="font-medium">Mailing evidence</h2>
            <p className="mt-2 text-sm text-muted">
              Once the postcards have been submitted for mailing, the documentation for your edition will appear here
              to view and download.
            </p>
            <div className="mt-4 rounded-xl border border-dashed border-line bg-background-soft p-6 text-center text-sm text-muted">
              Nothing yet. This campaign hasn&apos;t been mailed, so there is no mailing documentation to show.
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card as="section">
            <h2 className="font-medium">Your ad</h2>
            <div className="mx-auto mt-4 max-w-[220px]">
              <PostcardPreview side={view.area.side} otherSlots={view.otherSlots} area={view.area} showSafeArea={false} zones={DEMO_ZONES}>
                {view.artwork?.crop ? (
                  <CroppedImage src={view.artwork.viewUrl} imageWidth={view.artwork.width} imageHeight={view.artwork.height} crop={view.artwork.crop} alt="Your ad" />
                ) : (
                  <div className="flex h-full items-center justify-center bg-accent-soft p-2 text-center text-[10px] text-accent">Your ad</div>
                )}
              </PostcardPreview>
            </div>
            <dl className="mt-4 grid gap-2 text-sm">
              <Row label="Position" value={`${view.area.side === "front" ? "Front" : "Back"} · ${view.positions.map((p) => p.label).join(" + ")}`} />
              <Row label="Size" value={view.size === "double" ? "Double" : "Standard"} />
              <Row label="Reserve-by date" value={formatDeadline(view.artworkDeadline)} />
            </dl>
          </Card>

          <Card as="section">
            <h2 className="font-medium">Payment</h2>
            <div className="mt-3 flex items-center justify-between">
              <StatusBadge>Not charged yet (sample)</StatusBadge>
              <span className="font-display text-2xl">{formatPrice(view.priceCents)}</span>
            </div>
            <p className="mt-2 text-xs text-muted">Charged only if the campaign fills and is approved.</p>
          </Card>

          <Card as="section">
            <h2 className="font-medium">Final postcard proof</h2>
            <p className="mt-2 text-sm text-muted">The full printed layout will be shared here before printing.</p>
          </Card>

          <Card as="section" tone="dark">
            <h2 className="font-medium">Book the next edition</h2>
            <p className="mt-2 text-sm text-background/75">Keep your business in front of neighbors month after month.</p>
            <ButtonLink href="/demo/areas" variant="inverse" className="mt-4">
              See upcoming editions
            </ButtonLink>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
