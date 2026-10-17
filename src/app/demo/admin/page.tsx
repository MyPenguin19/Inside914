import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Card, Eyebrow, Notice, StatusBadge } from "@/components/ui/primitives";
import { Timeline } from "@/components/ui/timeline";
import { DEMO_ADVERTISERS, DEMO_EDITION } from "@/lib/demo/data";
import { formatDeadline, formatIssueMonth, formatPrice } from "@/lib/format";

const SECTIONS = [
  ["#overview", "Overview"],
  ["#inventory", "Spaces"],
  ["#advertisers", "Advertisers"],
  ["#artwork", "Artwork review"],
  ["#progress", "Campaign progress"],
  ["#mailing", "Mailing documentation"],
  ["#next", "Next edition"],
];

// OWNER DASHBOARD design preview: sample numbers derived from sample inventory; no actions work.
export default function DemoAdminPage() {
  const reserved = DEMO_EDITION.slots.filter((s) => !s.available).length;
  const total = DEMO_EDITION.slots.length;
  const booked = DEMO_ADVERTISERS.reduce((sum, a) => sum + a.amount, 0);
  const potential = DEMO_EDITION.slots.filter((s) => s.available).length * DEMO_EDITION.unitPriceCents + booked;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Dashboard sections" className="lg:sticky lg:top-24 lg:self-start">
        <p className="font-display text-lg font-medium">Owner dashboard</p>
        <ul className="mt-4 flex gap-2 overflow-x-auto text-sm lg:flex-col lg:gap-1">
          {SECTIONS.map(([href, label]) => (
            <li key={href}>
              <a href={href} className="block whitespace-nowrap rounded-lg px-3 py-2 text-muted hover:bg-background-soft hover:text-foreground">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-col gap-8">
        <Notice tone="warning" role="note">
          <strong>Design preview with sample data.</strong> These are not real advertisers or payments, and the buttons
          don&apos;t do anything yet.
        </Notice>

        <section id="overview" aria-labelledby="overview-title" className="scroll-mt-24">
          <Eyebrow>{formatIssueMonth(DEMO_EDITION.issueMonth)} edition</Eyebrow>
          <h1 id="overview-title" className="mt-2 font-display text-4xl font-medium tracking-tight">
            {DEMO_EDITION.zoneName}
          </h1>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Spaces reserved" value={`${reserved} of ${total}`} />
            <Stat label="Reserved value" value={formatPrice(booked)} />
            <Stat label="Potential if full" value={formatPrice(potential)} note="All open spaces sold as standard" />
            <Stat label="Reserve-by date" value={formatDeadline(DEMO_EDITION.artworkDeadline)} />
          </div>
        </section>

        <section id="inventory" aria-labelledby="inventory-title" className="scroll-mt-24">
          <h2 id="inventory-title" className="text-lg font-semibold">Spaces</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {(["front", "back"] as const).map((side) => (
              <Card key={side}>
                <p className="text-sm font-medium">{side === "front" ? "Front" : "Back"}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {DEMO_EDITION.slots
                    .filter((s) => s.side === side)
                    .map((s) => (
                      <div
                        key={s.id}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${s.available ? "border-line" : "border-accent bg-accent-soft"}`}
                      >
                        <span className="font-medium">{s.label}</span>
                        <span className={`text-xs ${s.available ? "text-muted" : "text-accent"}`}>{s.available ? "Open" : "Reserved"}</span>
                      </div>
                    ))}
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section id="advertisers" aria-labelledby="advertisers-title" className="scroll-mt-24">
          <h2 id="advertisers-title" className="text-lg font-semibold">Advertisers</h2>
          <div className="mt-4">
            <DataTable
              caption="Advertisers in this edition (sample)"
              columns={["Business", "Position", "Size", "Amount", "Artwork", "Payment"]}
              rows={DEMO_ADVERTISERS.map((a) => [
                <span key="b" className="font-medium">{a.business}</span>,
                a.position,
                a.size,
                formatPrice(a.amount),
                <StatusBadge key="a" tone={a.artwork === "Approved" ? "success" : "warning"}>{a.artwork}</StatusBadge>,
                <StatusBadge key="p" tone="info">{a.payment}, not charged</StatusBadge>,
              ])}
            />
          </div>
        </section>

        <section id="artwork" aria-labelledby="artwork-title" className="scroll-mt-24">
          <h2 id="artwork-title" className="text-lg font-semibold">Artwork review</h2>
          <Card className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Sample Home Services · B5 + B6</p>
              <p className="text-sm text-muted">Double-size ad waiting for review.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" disabled>Request changes</Button>
              <Button disabled>Approve</Button>
            </div>
          </Card>
        </section>

        <section id="progress" aria-labelledby="progress-title" className="scroll-mt-24">
          <h2 id="progress-title" className="text-lg font-semibold">Campaign progress</h2>
          <Card className="mt-4">
            <Timeline
              label="Campaign progress (sample)"
              steps={[
                { title: "Selling spaces", state: "current", description: `${reserved} of ${total} reserved` },
                { title: "Approve campaign for print", state: "upcoming" },
                { title: "Collect payments", state: "upcoming" },
                { title: "Print", state: "upcoming" },
                { title: "Submit for mailing", state: "upcoming" },
                { title: "Upload mailing documentation", state: "upcoming" },
              ]}
            />
          </Card>
        </section>

        <section id="mailing" aria-labelledby="mailing-title" className="scroll-mt-24">
          <h2 id="mailing-title" className="text-lg font-semibold">Mailing documentation</h2>
          <Card className="mt-4">
            <p className="text-sm text-muted">After mailing, upload the documentation here. It will appear on every advertiser&apos;s Verified Mail page.</p>
            <Button variant="secondary" className="mt-4" disabled>Upload documentation</Button>
          </Card>
        </section>

        <section id="next" aria-labelledby="next-title" className="scroll-mt-24">
          <h2 id="next-title" className="text-lg font-semibold">Next edition</h2>
          <Card className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Central Westchester · February 2027</p>
              <p className="text-sm text-muted">Draft, not open for booking (sample).</p>
            </div>
            <Button disabled>Open for booking</Button>
          </Card>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl font-medium">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </Card>
  );
}
