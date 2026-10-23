import { loadHouseArtwork } from "@/lib/print/house-artwork";
import { PrintDownload } from "@/components/admin/print-download";
import { CollectionPanel } from "@/components/admin/collection-panel";
import { PrinterRecords } from "@/components/admin/printer-records";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { markCampaignMailed } from "@/app/admin/collection-actions";
import { campaignOperationStatus } from "@/lib/admin/operations";
import { POSTCARD_PRICES } from "@/lib/pricing";
import { bookingSizeLabel } from "@/lib/booking/products";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { InventoryTable } from "@/components/admin/inventory-table";
import { PostcardMap } from "@/components/admin/postcard-map";
import { Badge, DetailList, EmptyState, LoadError, PageHeader, PanelSkeleton, Stat } from "@/components/admin/ui";
import type { SlotView } from "@/components/postcard/postcard-side";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { listConsents, listEditionBookings, listEditions, listSlots } from "@/lib/admin/data";
import { artworkLabel, paymentLabel, positionLabel, reservationLabel } from "@/lib/admin/labels";
import { artworkAwaitingReview, campaignStats, isConfirmed, isLiveHold, slotStates } from "@/lib/admin/metrics";
import { CampaignStatusControls } from "@/components/admin/campaign-status-controls";
import { ButtonLink } from "@/components/ui/button";
import { findTemplate } from "@/lib/admin/layouts";
import { formatDay, formatDeadline, formatHouseholds, formatIssueMonth, formatPrice, formatTimestamp } from "@/lib/format-admin";

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
    const consents = await listConsents(supabase, bookings.map(b => b.id));
    const [mail, collection, ledger] = edition.productModel === "square_v1" ? await Promise.all([
      supabase.rpc("admin_mail_readiness", {p_id:id}), supabase.rpc("admin_collection_preview", {p_id:id}),
      supabase.from("zone_charges").select("status").eq("edition_id",id),
    ]) : [{data:false,error:null},{data:null,error:null},{data:[],error:null}];
    if(mail.error || collection.error || ledger.error) throw new Error("Could not verify campaign readiness");
    const houseReady = edition.productModel === "square_v1" && !!await loadHouseArtwork(supabase);
    data = { houseReady, edition, slots, bookings, consents, mailReady:houseReady && mail.data === true, chargeReady:houseReady && (collection.data as {ready?:boolean}|null)?.ready === true, charges:ledger.data ?? [] };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error; // notFound()
    console.error(error instanceof Error ? error.message : "admin campaign failed");
    return <LoadError what="this campaign" />;
  }

  const { edition, slots, bookings } = data;
  const stats = campaignStats(edition, slots, bookings, now);
  const states = slotStates(edition, slots, bookings, now);
  const labels = new Map(slots.map((s) => [s.id, { label: s.label, side: s.side }]));
  const approved = bookings.filter(b=>isConfirmed(b) && b.artworkReview === "approved").length;
  const operationStatus = campaignOperationStatus({status:edition.status,paused:!!edition.pausedAt,filled:stats.reservedUnits,approved,paid:data.charges.filter(c=>c.status==="succeeded").length,issues:data.charges.filter(c=>["requires_action","requires_payment_method","canceled"].includes(c.status)).length,chargeReady:data.chargeReady,mailReady:data.mailReady});
  const active = bookings.filter((b) => isConfirmed(b) || isLiveHold(b, now));

  const views = (side: "front" | "back"): SlotView[] =>
    slots
      .filter((s) => s.side === side)
      .map((s) => {
        const st = states.get(s.id)!;
        const who = st.booking?.contact?.businessName;
        const note =
          st.state === "reserved" ? (who ?? "Reserved") : st.state === "held" ? `On hold${who ? `: ${who}` : ""}` : st.state === "blocked" ? "Blocked" : st.state === "closed" ? "Closed" : "Available";
        return { slot: { ...s, available: st.state === "available" }, selected: false, selectable: false, note };
      });

  return (
    <div className="flex flex-col gap-7">
      <div>
        <Link href="/admin/campaigns" className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
          ← All campaigns
        </Link>
        <div className="mt-2">
          <PageHeader title={edition.name ?? edition.zoneName} description={`${edition.zoneName} · ${formatIssueMonth(edition.issueMonth)} edition`}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={edition.status === "open" && !edition.pausedAt ? "success" : edition.pausedAt ? "warning" : "neutral"}>
                {edition.productModel === "square_v1" ? operationStatus : edition.status.replaceAll("_", " ")}
              </StatusBadge>
              {!["cancelled", "completed"].includes(edition.status) && (
                <ButtonLink href={`/admin/campaigns/${edition.id}/edit`} variant="secondary">
                  Edit
                </ButtonLink>
              )}
            </div>
          </PageHeader>
        </div>
      </div>

      <section aria-label="Reservation progress" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Spots filled" value={`${stats.reservedUnits} of ${stats.totalUnits}`} note={edition.status === "draft" ? "Campaign not open yet" : `${stats.filledPercent}% filled`} />
        <Stat label="Authorized value" value={formatPrice(stats.reservedValueCents)} note="Not collected at reservation" />
        <Stat label="Artwork approved" value={`${approved} of ${stats.reservations}`} />
        <Stat label="Payment methods ready" value={`${stats.paymentMethodsReady} of ${stats.reservations}`} />
      </section>

      {edition.productModel === "square_v1" && <>
        <PrintDownload editionId={id} ready={data.mailReady} houseReady={data.houseReady} filled={stats.reservedUnits} />
        <CollectionPanel editionId={id} />
        {data.mailReady && !["mailed","completed"].includes(edition.status) && <ConfirmAction label="Mark as mailed" action={markCampaignMailed} fields={{id}} confirmLabel="Mark mailed" consequence={<>Confirm you uploaded the final front and back to AmazingMail and submitted the mailing. This records your confirmation and does not order a mailing or charge anyone.</>} />}
      </>}

      <div className="flex flex-wrap gap-3">
        <ButtonLink href={`/admin/artwork?campaign=${edition.id}`} variant="secondary">Approve artwork</ButtonLink>
        <ButtonLink href={`/admin/payments?campaign=${edition.id}`} variant="secondary">Review payments</ButtonLink>
      </div>

      <section aria-labelledby="status-title">
        <h2 id="status-title" className="text-lg font-semibold">
          Status
        </h2>
        {stats.fullyReserved && (
          <p className="mt-1 text-sm text-accent">All spaces are reserved. Review artwork and payments above before preparing the mailing.</p>
        )}
        {stats.blockedUnits > 0 && (
          <p className="mt-1 text-sm text-muted">
            {stats.blockedUnits} {stats.blockedUnits === 1 ? "space is" : "spaces are"} blocked, so {stats.sellableUnits} of {stats.totalUnits} are sellable. Blocked spaces never count as sold.
          </p>
        )}
        <div className="mt-3">
          <CampaignStatusControls edition={edition} stats={stats} now={now} />
        </div>
      </section>

      {edition.productModel === "square_v1" && <PrinterRecords editionId={id} />}

      <details>
        <summary className="cursor-pointer text-lg font-semibold">Campaign dates and details</summary>
        <div className="mt-4">
          <DetailList
            rows={[
              ["Area", edition.zoneName],
              ["Issue month", formatIssueMonth(edition.issueMonth)],
              ["Reservations open", edition.reservationsOpenAt ? formatTimestamp(edition.reservationsOpenAt) : "As soon as it's opened"],
              ["Reservation deadline", formatDeadline(edition.artworkDeadline)],
              ["Artwork due", edition.artworkDueAt ? formatTimestamp(edition.artworkDueAt) : "Same as reservation deadline"],
              ["Mailing window", edition.mailingWindowStart ? `${formatDay(edition.mailingWindowStart)} – ${formatDay(edition.mailingWindowEnd ?? edition.mailingWindowStart)}` : edition.mailDate ? formatDay(edition.mailDate) : "Not set"],
              ["Target mailing quantity", `≈ ${formatHouseholds(edition.households)} homes`],
              ["Layout", findTemplate(edition.layoutTemplate ?? "")?.label ?? (edition.layoutTemplate ? edition.layoutTemplate : "Created before templates (provisional grid)")],
              ["Prices (new bookings)", edition.productModel === "square_v1" ? "$399 ad per area · 10 paid positions" : `${formatPrice(edition.unitPriceCents ?? 0)} standard${edition.doublePriceCents ? ` · ${formatPrice(edition.doublePriceCents)} double` : ""} · ${formatPrice(POSTCARD_PRICES.fullSidePriceCents)} full side · ${formatPrice(POSTCARD_PRICES.bothSidesPriceCents)} both sides (per area)`],
              ["Artwork approval", `${stats.artworkAwaitingReview} awaiting review of ${stats.reservations} reservations`],
              ["Payment methods ready", `${stats.paymentMethodsReady} of ${stats.reservations}`],
              ["Advertisers", String(stats.advertisers)],
            ]}
          />
        </div>
      </details>

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
                <PostcardMap layoutKey={edition.layoutTemplate} dimensions={edition.productModel === "square_v1" ? { width: 9, height: 6 } : undefined} side={side} views={views(side)} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="spaces-title">
        <h2 id="spaces-title" className="text-lg font-semibold">
          Spaces
        </h2>
        <div className="mt-3">
          <InventoryTable slots={slots} states={states} expired={bookings.filter((b) => b.status === "pending" && !isLiveHold(b, now) && b.claims.some((c) => !c.released))} />
        </div>
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
              columns={["Business", "Position", "Product", "Status", "Artwork", "Payment", "Amount"]}
              rows={active.map((b) => [
                <Link key="b" href={`/admin/advertisers/${b.id}`} className="font-medium underline-offset-4 hover:underline">
                  {b.contact?.businessName ?? "No details yet"}
                </Link>,
                positionLabel(b, labels),
                edition.productModel === "square_v1" ? "Square" : bookingSizeLabel(b.size),
                <Badge key="s" label={reservationLabel(b, now)} />,
                <Badge key="a" label={artworkAwaitingReview(b) ? { text: "Awaiting review", tone: "warning" } : artworkLabel(b)} />,
                <Badge key="p" label={paymentLabel(b)} />,
                `${formatPrice(b.priceCents)}${b.pricingMode === "test" && edition.productModel !== "square_v1" ? " (test price)" : ""}`,
              ])}
            />
          )}
        </div>
      </section>
    </div>
  );
}
