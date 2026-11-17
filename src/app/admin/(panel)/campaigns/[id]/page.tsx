import { CampaignNavigation } from "@/components/admin/campaign-navigation";
import { campaignSection, campaignNextStep, campaignStatusLabel } from "@/lib/admin/workflow";
import { CampaignArtworkBackup } from "@/components/admin/original-backup-panel";
import { CampaignInvitations } from "@/components/admin/campaign-invitations";
import sharp from "sharp";
import { CampaignManagement } from "@/components/admin/campaign-management";
import { AssembledSide, type Placement } from "@/components/admin/assembled-postcard";
import { layoutVersion } from "@/lib/print/layouts";
import { getCampaignProduction } from "@/lib/admin/production-data";
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
import { Card, StatusBadge } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { signArtwork, listEditionBookings, getEdition, listSlots } from "@/lib/admin/data";
import { artworkLabel, paymentLabel, positionLabel, reservationLabel } from "@/lib/admin/labels";
import { artworkAwaitingReview, campaignStats, isConfirmed, isLiveHold, slotStates } from "@/lib/admin/metrics";
import { CampaignStatusControls } from "@/components/admin/campaign-status-controls";
import { ButtonLink } from "@/components/ui/button";
import { findTemplate } from "@/lib/admin/layouts";
import { formatDay, formatDeadline, formatHouseholds, formatIssueMonth, formatPrice, formatTimestamp } from "@/lib/format-admin";

export default function CampaignDetailPage({ params, searchParams }: PageProps<"/admin/campaigns/[id]">) {
  return (
    <Suspense fallback={<PanelSkeleton />}>
      <CampaignDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CampaignDetail({ params, searchParams }: Pick<PageProps<"/admin/campaigns/[id]">, "params" | "searchParams">) {
  const { supabase, now } = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const view = campaignSection((await searchParams).view);

  let data;
  try {
    const edition = await getEdition(supabase, id);
    if (!edition) notFound();
    const [slots, bookings, production, artworkHouse] = await Promise.all([
      listSlots(supabase, [id]), listEditionBookings(supabase, [id]),
      edition.productModel === "square_v1" && view === "mailing" ? getCampaignProduction(supabase, id) : null,
      edition.productModel === "square_v1" && view === "artwork" ? loadHouseArtwork(supabase) : undefined,
    ]);
    if (production?.mail.error || production?.collection.error || production?.ledger.error) throw new Error("Could not verify campaign readiness");
    // Image decoding/base64 is only needed for the assembled artwork view.
    // Reservation and settings tabs never download the house image or run payment RPCs.
    const houseReady = !!production?.houseBytes;
    const houseMeta = artworkHouse ? await sharp(artworkHouse).metadata() : null;
    const house = artworkHouse && houseMeta?.width && houseMeta.height ? {src:`data:image/png;base64,${artworkHouse.toString("base64")}`,width:houseMeta.width,height:houseMeta.height} : undefined;
    const confirmed = bookings.filter(isConfirmed);
    const artworks = view === "artwork" ? await Promise.all(confirmed.map(b => signArtwork(b.id).catch(() => null))) : [];
    const placements: Placement[] = confirmed.map((b,i)=>({slots:slots.filter(s=>b.claims.some(c=>!c.released && c.slotId===s.id)),business:b.contact?.businessName ?? "Advertiser",artwork:artworks[i],approved:b.artworkReview==="approved"}));
    data = { house, placements, houseReady, edition, slots, bookings, mailReady:houseReady && production?.mail.data === true, chargeReady:houseReady && (production?.collection.data as {ready?:boolean}|null)?.ready === true, charges:production?.ledger.data ?? [] };
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
  const next = campaignNextStep(edition, stats, now);
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
    <div className="flex flex-col gap-7" data-campaign-id={id} data-layout-key={edition.layoutTemplate}>
      <div>
        <Link href="/admin/campaigns" className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
          ← All campaigns
        </Link>
        <div className="mt-2">
          <PageHeader title={edition.name ?? edition.zoneName} description={`${edition.zoneName} · ${formatIssueMonth(edition.issueMonth)} · ${layoutVersion(edition.layoutTemplate)} · ${edition.productModel === "square_v1" ? `${formatPrice(edition.unitPriceCents ?? 0)} front · ${formatPrice(edition.backUnitPriceCents ?? 0)} back` : `${formatPrice(edition.unitPriceCents ?? 0)} per position`}`}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={edition.status === "open" && !edition.pausedAt ? "success" : edition.pausedAt ? "warning" : "neutral"}>
                {edition.productModel === "square_v1" && view === "mailing" && !edition.archivedAt ? operationStatus : campaignStatusLabel(edition)}
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

      <CampaignNavigation id={id} current={view} />

      {view === "overview" && <>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Your next step</p>
          <h2 className="mt-2 text-xl font-semibold">{next.title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">{next.detail}</p>
          <div className="mt-4"><ButtonLink href={next.href}>{next.label}</ButtonLink></div>
        </Card>
      <section aria-label="Reservation progress" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Spots filled" value={`${stats.reservedUnits} of ${stats.totalUnits}`} note={edition.status === "draft" ? "Campaign not open yet" : `${stats.filledPercent}% filled`} />
        <Stat label="Authorized value" value={formatPrice(stats.reservedValueCents)} note="Not collected at reservation" />
        <Stat label="Artwork approved" value={`${approved} of ${stats.reservations}`} />
        <Stat label="Payment methods ready" value={`${stats.paymentMethodsReady} of ${stats.reservations}`} />
      </section>

      <section aria-labelledby="status-title">
        <h2 id="status-title" className="text-lg font-semibold">
          Reservations
        </h2>
        {stats.fullyReserved && (
          <p className="mt-1 text-sm text-accent">All spaces are reserved. Continue to Artwork, then Print & mail to prepare this campaign.</p>
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

      <section aria-labelledby="inventory-title">
        <h2 id="inventory-title" className="text-lg font-semibold">
          Spaces at a glance
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

      </>}

      {view === "advertisers" && <>
        <div><h2 className="text-xl font-semibold">Advertisers &amp; spaces</h2><p className="mt-1 text-sm text-muted">Invite a business, open a reservation, or manage an individual space.</p></div>
      <CampaignInvitations editionId={id} positions={slots.filter(s=>states.get(s.id)?.state==="available").map(s=>({id:s.id,label:s.label}))}/>
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
                edition.productModel === "square_v1" ? "Position" : bookingSizeLabel(b.size),
                <Badge key="s" label={reservationLabel(b, now)} />,
                <Badge key="a" label={artworkAwaitingReview(b) ? { text: "Awaiting review", tone: "warning" } : artworkLabel(b)} />,
                <Badge key="p" label={paymentLabel(b)} />,
                `${formatPrice(b.priceCents)}${b.pricingMode === "test" && edition.productModel !== "square_v1" ? " (test price)" : ""}`,
              ])}
            />
          )}
        </div>
      </section>
      <section aria-labelledby="inventory-title">
        <h2 id="inventory-title" className="text-lg font-semibold">
          Spaces at a glance
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

        <details className="rounded-2xl border border-line bg-surface p-5">
          <summary className="cursor-pointer font-semibold">Manage individual spaces</summary>
          <p className="my-3 text-sm text-muted">Block or reopen a space, or release an expired hold.</p>
      <section aria-labelledby="spaces-title">
        <h2 id="spaces-title" className="text-lg font-semibold">
          Spaces
        </h2>
        <div className="mt-3">
          <InventoryTable slots={slots} states={states} expired={bookings.filter((b) => b.status === "pending" && !isLiveHold(b, now) && b.claims.some((c) => !c.released))} />
        </div>
      </section>

        </details>
      </>}

      {view === "artwork" && <>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-xl font-semibold">Review your postcard artwork</h2><p className="mt-1 text-sm text-muted">{approved} of {stats.reservations} ads approved. Open the review queue to approve an ad or request changes.</p></div>
          <ButtonLink href={`/admin/artwork?campaign=${id}`}>Review artwork</ButtonLink>
        </div>
      {edition.productModel === "square_v1" && <section aria-label="Assembled postcard" className="grid gap-6 sm:grid-cols-2">
        {(["front","back"] as const).map(side=><AssembledSide key={side} side={side} slots={slots} placements={data.placements} layoutKey={edition.layoutTemplate} house={data.house}/>)}
      </section>}
        <Suspense fallback={<PanelSkeleton label="Loading original artwork downloads…" />}><CampaignArtworkBackup campaignId={id} /></Suspense>
        <ButtonLink href={`/admin/campaigns/${id}?view=mailing`} variant="secondary">Continue to Print &amp; mail</ButtonLink>
      </>}

      {view === "mailing" && <>
        <div><h2 className="text-xl font-semibold">Print &amp; mail</h2><p className="mt-1 text-sm text-muted">Prepare the postcard, save the printer’s approved proof, then review payments and record the mailing.</p></div>
        {edition.productModel === "square_v1" ? <>
          <PrintDownload editionId={id} ready={data.mailReady} houseReady={data.houseReady} filled={stats.reservedUnits} />
          <Suspense fallback={<PanelSkeleton label="Loading printer proofs…" />}><PrinterRecords editionId={id} /></Suspense>
          <Suspense fallback={<PanelSkeleton label="Checking payments…" />}><CollectionPanel editionId={id} /></Suspense>
          <Card>
            <h2 className="text-lg font-semibold">Record the mailing</h2>
            <p className="my-3 text-sm text-muted">After you submit the mailing to AmazingMail, record it here so the campaign stays up to date.</p>
            {["mailed", "completed"].includes(edition.status) ? <p>Mailing recorded.</p> : data.mailReady ? <ConfirmAction label="Mark as mailed" action={markCampaignMailed} fields={{id}} confirmLabel="Mark mailed" consequence={<>Confirm you uploaded the final front and back to AmazingMail and submitted the mailing. This records your confirmation and does not order a mailing or charge anyone.</>} /> : <p className="text-sm">Complete the artwork, proof and payment requirements above before marking this campaign as mailed.</p>}
          </Card>
        </> : <ButtonLink href={`/admin/production?campaign=${id}`}>Open printing &amp; mailing records</ButtonLink>}
        <ButtonLink href={`/admin/payments?campaign=${id}`} variant="secondary">Review payment records</ButtonLink>
      </>}

      {view === "settings" && <>
        <h2 className="text-xl font-semibold">Campaign settings</h2>
      <details open>
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
              ["Prices (new bookings)", edition.productModel === "square_v1" ? `${formatPrice(edition.unitPriceCents ?? 0)} front · ${formatPrice(edition.backUnitPriceCents ?? 0)} back · 10 paid positions` : `${formatPrice(edition.unitPriceCents ?? 0)} standard${edition.doublePriceCents ? ` · ${formatPrice(edition.doublePriceCents)} double` : ""} · ${formatPrice(POSTCARD_PRICES.fullSidePriceCents)} full side · ${formatPrice(POSTCARD_PRICES.bothSidesPriceCents)} both sides (per area)`],
              ["Artwork approval", `${stats.artworkAwaitingReview} awaiting review of ${stats.reservations} reservations`],
              ["Payment methods ready", `${stats.paymentMethodsReady} of ${stats.reservations}`],
              ["Advertisers", String(stats.advertisers)],
            ]}
          />
        </div>
      </details>

        <details className="rounded-2xl border border-line bg-surface p-5">
          <summary className="cursor-pointer font-semibold">Archive, delete or change layout</summary>
          <div className="mt-4"><CampaignManagement edition={edition} /></div>
        </details>
        <details className="text-sm text-muted"><summary className="cursor-pointer">Technical reference</summary><p className="mt-3 break-all">Campaign ID: {id} · Layout: {layoutVersion(edition.layoutTemplate)}</p></details>
      </>}
    </div>
  );
}
