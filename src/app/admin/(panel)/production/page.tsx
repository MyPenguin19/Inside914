import { CollectionPanel } from "@/components/admin/collection-panel";
import { ZoneReadiness } from "@/components/admin/zone-readiness";
import { zoneReadiness } from "@/lib/admin/zone-readiness";
import { Suspense } from "react";
import { publishEvidence } from "@/app/admin/admin-actions";
import { AssembledSide, type Placement } from "@/components/admin/assembled-postcard";
import { CampaignStatusControls } from "@/components/admin/campaign-status-controls";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { EvidenceForm } from "@/components/admin/evidence-form";
import { DetailList, EmptyState, LoadError, PageHeader, PanelSkeleton } from "@/components/admin/ui";
import { Card, Notice, StatusBadge } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { listConsents, listEditionBookings, listEditions, listEvidence, listSlots, signArtwork, signEvidence } from "@/lib/admin/data";
import { findTemplate } from "@/lib/admin/layouts";
import { campaignStats, isConfirmed, paymentReadinessDetail, type AdminEdition } from "@/lib/admin/metrics";
import { formatDay, formatHouseholds, formatIssueMonth, formatTimestamp } from "@/lib/format-admin";

const KIND: Record<string, string> = {
  printer_confirmation: "Printer confirmation",
  final_proof: "Final approved proof",
  postal_acceptance: "Postal acceptance receipt",
  mailing_confirmation: "Mailing provider confirmation",
  other: "Other",
};

export default function ProductionPage({ searchParams }: PageProps<"/admin/production">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Production" description="Assembly, blockers and genuine mailing documentation for a campaign." />
      <Suspense fallback={<PanelSkeleton />}>
        <Production searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// Most relevant campaign: one in production, else closed (awaiting approval), else open, else newest.
function pick(editions: AdminEdition[], requested?: string) {
  const order = ["approved_to_print", "printed", "mailed", "closed", "open"];
  return editions.find((e) => e.id === requested) ?? order.map((s) => editions.find((e) => e.status === s)).find(Boolean) ?? editions[0] ?? null;
}

async function Production({ searchParams }: { searchParams: PageProps<"/admin/production">["searchParams"] }) {
  const { supabase, now } = await requireAdmin();
  const sp = await searchParams;

  let data;
  try {
    const editions = await listEditions(supabase);
    const edition = pick(editions, typeof sp.campaign === "string" ? sp.campaign : undefined);
    if (!edition) {
      data = null;
    } else {
      const [slots, bookings, evidence] = await Promise.all([
        listSlots(supabase, [edition.id]),
        listEditionBookings(supabase, [edition.id]),
        listEvidence(supabase, edition.id),
      ]);
      const confirmed = bookings.filter(isConfirmed);
      const [consents, artworks, evidenceLinks] = await Promise.all([
        listConsents(
          supabase,
          confirmed.map((b) => b.id),
        ),
        Promise.all(confirmed.map((b) => signArtwork(b.id).catch(() => null))),
        Promise.all(evidence.map((e) => (e.storage_path ? signEvidence(e.storage_path) : Promise.resolve(null)))),
      ]);
      data = {
        editions,
        edition,
        slots,
        bookings,
        confirmed,
        consents,
        artworks,
        evidence,
        evidenceLinks,
      };
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "admin production failed");
    return <LoadError what="production" />;
  }

  if (!data) return <EmptyState title="No campaigns yet." />;
  const { editions, edition: e, slots, bookings, confirmed, consents, artworks, evidence, evidenceLinks } = data;
  const stats = campaignStats(e, slots, bookings, now);
  const placements: Placement[] = confirmed.map((b, i) => ({
    slots: slots.filter((s) => b.claims.some((c) => !c.released && c.slotId === s.id)),
    business: b.contact?.businessName ?? "Advertiser",
    artwork: artworks[i],
    approved: b.artworkReview === "approved",
  }));
  const approved = confirmed.filter((b) => b.artworkReview === "approved").length;
  const notReady = confirmed.filter((b) => !paymentReadinessDetail(b, consents.get(b.id)).ready).length;

  const blockers = [
    e.status === "open" || e.status === "draft" ? "Reservations aren't closed yet" : null,
    !stats.fullyReserved ? `${Math.max(0, (e.productModel === "square_v1" ? 10 : stats.sellableUnits) - stats.reservedUnits)} of ${e.productModel === "square_v1" ? 10 : stats.sellableUnits} paid positions aren't reserved` : null,
    confirmed.length - approved > 0
      ? `${confirmed.length - approved} ${confirmed.length - approved === 1 ? "ad needs" : "ads need"} content approval`
      : null,
    notReady > 0 ? `${notReady} ${notReady === 1 ? "reservation isn't" : "reservations aren't"} payment-ready` : null,
    "Printer specifications aren't confirmed, so no file can be marked print-ready",
    ["approved_to_print", "printed"].includes(e.status) && !evidence.some((x) => x.kind === "printer_confirmation")
      ? "No printer confirmation uploaded yet"
      : null,
  ].filter(Boolean) as string[];

  return (
    <>
      {editions.length > 1 && (
        <form action="/admin/production" className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="prod-campaign" className="text-muted">
            Campaign
          </label>
          <select id="prod-campaign" name="campaign" defaultValue={e.id} className="min-w-0 rounded-xl border border-line bg-surface px-3 py-2">
            {editions.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name ?? `${x.zoneName} · ${formatIssueMonth(x.issueMonth)}`} ({x.status.replaceAll("_", " ")})
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-full border border-line px-4 py-2 hover:border-foreground">
            Show
          </button>
        </form>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{e.name ?? `${e.zoneName} · ${formatIssueMonth(e.issueMonth)}`}</h2>
          <StatusBadge tone={e.status === "approved_to_print" ? "success" : "neutral"}>{e.status.replaceAll("_", " ")}</StatusBadge>
        </div>
        <div className="mt-4">
          <DetailList
            rows={[
              ["Layout", findTemplate(e.layoutTemplate ?? "")?.label ?? "Provisional grid"],
              ["Advertising positions", `${stats.reservedUnits} reserved of ${stats.sellableUnits} sellable (${stats.totalUnits} total)`],
              ["Artwork content approval", `${approved} of ${confirmed.length}`],
              ["Print-ready files", "Not assessed (printer specifications pending)"],
              ["Planned mailing quantity", `≈ ${formatHouseholds(e.households)} homes (planned, not printed or mailed)`],
              [
                "Planned mailing window",
                e.mailingWindowStart
                  ? `${formatDay(e.mailingWindowStart)} – ${formatDay(e.mailingWindowEnd ?? e.mailingWindowStart)}`
                  : e.mailDate
                    ? formatDay(e.mailDate)
                    : "Not set",
              ],
            ]}
          />
        </div>
      </Card>

      {e.productModel === "square_v1" && <ZoneReadiness readiness={zoneReadiness(e, slots, bookings, consents)} />}

      {e.productModel === "square_v1" && <CollectionPanel editionId={e.id} />}

      <section aria-labelledby="blockers-title">
        <h2 id="blockers-title" className="text-lg font-semibold">
          Production blockers
        </h2>
        <ul className="mt-3 grid gap-2">
          {blockers.map((b) => (
            <li key={b} className="flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
              <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warning" />
              {b}
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <CampaignStatusControls edition={e} stats={stats} now={now} />
        </div>
      </section>

      <section aria-labelledby="assembled-title">
        <h2 id="assembled-title" className="text-lg font-semibold">
          Assembled postcard
        </h2>
        <Notice tone="warning" role="note">
          Preview only, not a print proof: provisional layout, and only content-approved ads are shown in place.
        </Notice>
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:max-w-3xl">
          {(["front", "back"] as const).map((side) => (
            <div key={side} className="mx-auto w-full max-w-[340px]">
              <AssembledSide square={e.productModel === "square_v1"} dimensions={e.productModel === "square_v1" ? { width: 9, height: 6 } : undefined} side={side} slots={slots} placements={placements} />
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="evidence-title">
        <h2 id="evidence-title" className="text-lg font-semibold">
          Mailing evidence
        </h2>
        <p className="mt-1 text-sm text-muted">
          Genuine documents only. Files are private; publishing marks a document as approved to show advertisers (showing it on their pages is a later
          task). Printed is not mailed, and postal acceptance is not delivery to every home.
        </p>
        {evidence.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No evidence uploaded for this campaign." />
          </div>
        ) : (
          <ul className="mt-3 grid gap-2">
            {evidence.map((x, i) => (
              <li
                key={x.id}
                className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-sm sm:flex-row sm:items-start sm:justify-between"
              >
                <div>
                  <p className="font-medium">
                    {x.title} <span className="font-normal text-muted">· {KIND[x.kind] ?? x.kind}</span>
                  </p>
                  <p className="text-muted">
                    Uploaded {formatTimestamp(x.uploaded_at)}
                    {x.event_date && ` · dated ${formatDay(x.event_date)}`}
                    {x.quantity_printed !== null && ` · printed ${formatHouseholds(x.quantity_printed)}`}
                    {x.quantity_accepted !== null && ` · accepted ${formatHouseholds(x.quantity_accepted)}`}
                  </p>
                  {x.notes && <p className="mt-1">{x.notes}</p>}
                  {evidenceLinks[i] && (
                    <a
                      href={evidenceLinks[i]!}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 inline-block underline-offset-4 hover:underline"
                    >
                      Open file (link expires shortly)
                    </a>
                  )}
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <StatusBadge tone={x.published_at ? "success" : "neutral"}>
                    {x.published_at ? `Published ${formatTimestamp(x.published_at)}` : "Not published"}
                  </StatusBadge>
                  <ConfirmAction
                    label={x.published_at ? "Unpublish" : "Publish"}
                    action={publishEvidence}
                    fields={{
                      evidence_id: x.id,
                      publish: x.published_at ? "false" : "true",
                    }}
                    confirmLabel={x.published_at ? "Unpublish" : "Publish"}
                    consequence={
                      x.published_at ? (
                        <>Hides this document from advertisers again. The file and its history are kept.</>
                      ) : (
                        <>Marks this genuine document as approved to show advertisers. Only publish real, final documentation.</>
                      )
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <Card className="mt-4">
          <h3 className="font-medium">Add evidence</h3>
          <div className="mt-4">
            <EvidenceForm editionId={e.id} />
          </div>
        </Card>
      </section>
    </>
  );
}
