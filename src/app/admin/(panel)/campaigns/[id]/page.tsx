import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PostcardMap } from "@/components/admin/postcard-map";
import { Badge, DetailList, EmptyState, LoadError, PageHeader, PanelSkeleton, Stat } from "@/components/admin/ui";
import type { SlotView } from "@/components/postcard/postcard-side";
import { DataTable } from "@/components/ui/data-table";
import { Card, StatusBadge } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { listEditionBookings, listEditions, listSlots } from "@/lib/admin/data";
import { artworkLabel, paymentLabel, positionLabel, reservationLabel } from "@/lib/admin/labels";
import { artworkAwaitingReview, campaignStats, isConfirmed, isLiveHold, slotStates } from "@/lib/admin/metrics";
import { formatDay, formatDeadline, formatHouseholds, formatIssueMonth, formatPrice } from "@/lib/format";

export default function CampaignDetailPage({ params }: PageProps<"/admin/campaigns/[id]">) {
  return (
    <Suspense fallback={<PanelSkeleton />}>
      <CampaignDetail params={params} />
    </Suspense>
  );
}

async function CampaignDetail({ params }: { params: PageProps<"/admin/campaigns/[id]">["params"] }) {
  const { supabase, now } = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  let data;
  try {
    const edition = (await listEditions(supabase)).find((e) => e.id === id);
    if (!edition) notFound();
    const [slots, bookings] = await Promise.all([listSlots(supabase, [id]), listEditionBookings(supabase, [id])]);
    data = { edition, slots, bookings };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error; // notFound()
    console.error(error instanceof Error ? error.message : "admin campaign failed");
    return <LoadError what="this campaign" />;
  }

  const { edition, slots, bookings } = data;
  const stats = campaignStats(edition, slots, bookings, now);
  const states = slotStates(edition, slots, bookings, now);
  const labels = new Map(slots.map((s) => [s.id, { label: s.label, side: s.side }]));
  const active = bookings.filter((b) => isConfirmed(b) || isLiveHold(b, now));

  const views = (side: "front" | "back"): SlotView[] =>
    slots
      .filter((s) => s.side === side)
      .map((s) => {
        const st = states.get(s.id)!;
        const who = st.booking?.contact?.businessName;
        const note = st.state === "reserved" ? (who ?? "Reserved") : st.state === "held" ? `On hold${who ? `: ${who}` : ""}` : st.state === "closed" ? "Closed" : "Available";
        return { slot: { ...s, available: st.state === "available" }, selected: false, selectable: false, note };
      });

  return (
    <div className="flex flex-col gap-7">
      <div>
        <Link href="/admin/campaigns" className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
          ← All campaigns
        </Link>
        <div className="mt-2">
          <PageHeader title={edition.zoneName} description={`${formatIssueMonth(edition.issueMonth)} edition`}>
            <StatusBadge tone={edition.status === "open" ? "success" : "neutral"}>{edition.status.replaceAll("_", " ")}</StatusBadge>
          </PageHeader>
        </div>
      </div>

      <section aria-label="Reservation progress" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Reserved units" value={`${stats.reservedUnits} of ${stats.totalUnits}`} note={`${stats.filledPercent}% filled`} />
        <Stat label="On hold" value={String(stats.heldUnits)} />
        <Stat label="Available" value={String(stats.availableUnits)} />
        <Stat label="Reserved value" value={formatPrice(stats.reservedValueCents)} note="Authorized, not collected" />
      </section>

      <Card>
        <h2 className="text-lg font-semibold">Campaign information</h2>
        <div className="mt-4">
          <DetailList
            rows={[
              ["Area", edition.zoneName],
              ["Issue month", formatIssueMonth(edition.issueMonth)],
              ["Reservation deadline", formatDeadline(edition.artworkDeadline)],
              ["Planned mail date", edition.mailDate ? formatDay(edition.mailDate) : "Not set"],
              ["Planned mailing quantity", `≈ ${formatHouseholds(edition.households)} homes`],
              ["Artwork approval", `${stats.artworkAwaitingReview} awaiting review of ${stats.reservations} reservations`],
              ["Payment methods ready", `${stats.paymentMethodsReady} of ${stats.reservations}`],
              ["Advertisers", String(stats.advertisers)],
            ]}
          />
        </div>
      </Card>

      <section aria-labelledby="inventory-title">
        <h2 id="inventory-title" className="text-lg font-semibold">
          Inventory
        </h2>
        {slots.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="This edition has no spaces defined." />
          </div>
        ) : (
          <div className="mt-3 grid gap-6 sm:grid-cols-2 lg:max-w-3xl">
            {(["front", "back"] as const).map((side) => (
              <div key={side} className="mx-auto w-full max-w-[340px]">
                <PostcardMap side={side} views={views(side)} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="reservations-title">
        <h2 id="reservations-title" className="text-lg font-semibold">
          Reservations and holds
        </h2>
        <div className="mt-3">
          {active.length === 0 ? (
            <EmptyState title="No reservations or active holds yet." />
          ) : (
            <DataTable
              caption="Reservations and active holds in this campaign"
              columns={["Business", "Position", "Size", "Status", "Artwork", "Payment", "Amount"]}
              rows={active.map((b) => [
                <Link key="b" href={`/admin/advertisers/${b.id}`} className="font-medium underline-offset-4 hover:underline">
                  {b.contact?.businessName ?? "No details yet"}
                </Link>,
                positionLabel(b, labels),
                b.size === "double" ? "Double" : "Standard",
                <Badge key="s" label={reservationLabel(b, now)} />,
                <Badge key="a" label={artworkAwaitingReview(b) ? { text: "Awaiting review", tone: "warning" } : artworkLabel(b)} />,
                <Badge key="p" label={paymentLabel(b)} />,
                `${formatPrice(b.priceCents)}${b.pricingMode === "test" ? " (test price)" : ""}`,
              ])}
            />
          )}
        </div>
      </section>
    </div>
  );
}
