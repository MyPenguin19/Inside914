import Link from "next/link";
import { Suspense } from "react";
import { Filters, pageParam } from "@/components/admin/filters";
import { EmptyState, LoadError, PageHeader, Pagination, PanelSkeleton, Stat } from "@/components/admin/ui";
import { DataTable } from "@/components/ui/data-table";
import { Notice } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { DetailList } from "@/components/admin/ui";
import { Card } from "@/components/ui/primitives";
import { listConsents, listEditionBookings, listEditions, listSlots, PAGE_SIZE, searchBookings, type BookingFilter } from "@/lib/admin/data";
import { simplePaymentStatus } from "@/lib/admin/operations";
import { campaignStats, isConfirmed, paymentReadinessDetail } from "@/lib/admin/metrics";
import { isTestStripeId } from "@/lib/dev/test-mode";
import { formatIssueMonth, formatPrice, formatTimestamp } from "@/lib/format-admin";

const FILTERS: [BookingFilter, string][] = [
  ["confirmed", "Reservations"],
  ["pending", "In checkout"],
  ["all", "All"],
];

export default function PaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Payments" description="See who has saved a card, paid or needs attention." />
      <Notice tone="info" role="note">
        Advertisers save a card with $0 due today. You approve payment only after a campaign fills and its final artwork is approved. Charging is currently turned off.
      </Notice>
      <Suspense fallback={<PanelSkeleton />}>
        <Payments searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Payments({ searchParams }: { searchParams: PageProps<"/admin/payments">["searchParams"] }) {
  const { supabase, now } = await requireAdmin();
  const sp = await searchParams;
  const filter = (FILTERS.find(([f]) => f === sp.filter)?.[0] ?? "confirmed") as BookingFilter;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined;
  const page = pageParam(sp.page);

  let data;
  try {
    const editions = await listEditions(supabase, true);
    const requested = typeof sp.campaign === "string" && /^[0-9a-f-]{36}$/.test(sp.campaign) ? sp.campaign : undefined;
    const selected = editions.find((e) => e.id === requested) ?? null;
    const [result, all, slots] = await Promise.all([
      searchBookings(supabase, { filter, q, page, editionId: requested, extra: "payment" }),
      listEditionBookings(supabase, requested ? [requested] : editions.map((e) => e.id)),
      selected ? listSlots(supabase, [selected.id]) : Promise.resolve([]),
    ]);
    const chargeQuery = supabase.from("zone_charges").select("booking_id,amount_cents,status,stripe_mode");
    const [consents, {data:charges,error:chargeError}, collection] = await Promise.all([
      listConsents(supabase, [...new Set([...result.rows, ...all.filter(isConfirmed)].map((b) => b.id))]),
      requested ? chargeQuery.eq("edition_id", requested) : chargeQuery,
      selected?.productModel === "square_v1" ? supabase.rpc("admin_collection_preview",{p_id:selected.id}) : {data:null,error:null},
    ]);
    if(chargeError) throw new Error("Could not load collection ledger");
    if(collection.error) throw new Error("Could not verify campaign readiness");
    data = { collectionReady:(collection.data as {ready?:boolean}|null)?.ready === true, charges: new Map(charges.map(c=>[c.booking_id,c])), ...result, all, slots, consents, selected, scope: requested ? "this campaign" : "all campaigns", editionList: editions, editions: new Map(editions.map((e) => [e.id, e])) };
  } catch (error) {
    console.error(error instanceof Error ? error.message : "admin payments failed");
    return <LoadError what="payments" />;
  }

  const confirmed = data.all.filter(isConfirmed);
  const authorized = confirmed.reduce((sum, b) => sum + b.priceCents, 0);
  const ready = confirmed.filter((b) => b.stripePaymentMethodId).length;
  const sel = data.selected;
  const selConfirmed = sel ? confirmed.filter((b) => b.editionId === sel.id) : [];
  const selStats = sel ? campaignStats(sel, data.slots, data.all, now) : null;
  const checks = selConfirmed.map((b) => paymentReadinessDetail(b, data.consents.get(b.id)));
  const readyCount = checks.filter((r) => r.ready).length;
  const approvedArtwork = selConfirmed.filter((b) => b.artworkReview === "approved").length;
  const daysLeft = sel ? Math.ceil((Date.parse(sel.artworkDeadline) - now) / 86_400_000) : 0;
  const href = (p: number) => {
    const s = new URLSearchParams();
    if (filter !== "confirmed") s.set("filter", filter);
    if (q) s.set("q", q);
    if (typeof sp.campaign === "string") s.set("campaign", sp.campaign);
    if (p > 1) s.set("page", String(p));
    return `/admin/payments${s.size ? `?${s}` : ""}`;
  };

  return (
    <>

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Stat label={`Authorized (${data.scope})`} value={formatPrice(authorized)} note={`${confirmed.length} confirmed reservations`} />
        <Stat label={`Cards saved (${data.scope})`} value={`${ready} of ${confirmed.length}`} />
        <Stat label={`Collected (${data.scope})`} value={formatPrice([...data.charges.values()].filter(c=>c.status==="succeeded" && c.stripe_mode==="live").reduce((sum,c)=>sum+c.amount_cents,0))} note="Recorded live payments only; test payments excluded" />
      </section>
      <Filters base="/admin/payments" filter={filter} filters={FILTERS} q={q} campaign={typeof sp.campaign === "string" ? sp.campaign : undefined} campaigns={data.editionList.map(e => ({id:e.id,label:e.name ?? `${e.zoneName} · ${formatIssueMonth(e.issueMonth)}`}))} />
      {sel && selStats && (
        <Card as="section" aria-labelledby="readiness-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="readiness-title" className="text-lg font-semibold">
              Readiness: {sel.name ?? `${sel.zoneName} · ${formatIssueMonth(sel.issueMonth)}`}
            </h2>
          </div>
          <p className="mt-2"><Link className="underline" href={`/admin/campaigns/${sel.id}?view=mailing`}>Open Print & mail for this campaign</Link></p>
          {selConfirmed.some(b=>data.consents.get(b.id)?.reviewReason)&&<p role="alert" className="mt-3 text-sm">Consent review required. Legacy deadlines and draft terms must be resolved before collection. Extending a campaign does not renew authorization.</p>}
          <details className="mt-4"><summary className="cursor-pointer">Advanced details</summary>
            <DetailList
              rows={[
                ["Fully reserved", selStats.fullyReserved ? "Yes" : `No (${selStats.reservedUnits} of ${selStats.sellableUnits} sellable units)`],
                ["Confirmed reservations", String(selConfirmed.length)],
                ["Occupied units", String(selStats.reservedUnits)],
                ["Expected charge amount", `${formatPrice(selConfirmed.reduce((s, b) => s + b.priceCents, 0))} (stored amounts)`],
                ["Payment-ready advertisers", `${readyCount} of ${selConfirmed.length}`],
                ["Blocked advertisers", String(selConfirmed.length - readyCount)],
                ["Artwork content approved", `${approvedArtwork} of ${selConfirmed.length}`],
                ["Reservation deadline", daysLeft > 0 ? `${formatTimestamp(sel.artworkDeadline)} (in ${daysLeft} ${daysLeft === 1 ? "day" : "days"})` : `Passed ${formatTimestamp(sel.artworkDeadline)}`],
              ]}
            />
          </details>
        </Card>
      )}

      {data.rows.length === 0 ? (
        <EmptyState title="No card setups here yet." />
      ) : (
        <>
          <DataTable
            caption="Payment authorizations"
            columns={["Business", "Area", "Amount", "Status"]}
            rows={data.rows.map((b) => {
              const e = data.editions.get(b.editionId);
              const charge = data.charges.get(b.id);
              const paidReady = sel?.id === b.editionId && data.collectionReady;
              return [
                <Link key="b" href={`/admin/advertisers/${b.id}`} className="font-medium underline-offset-4 hover:underline">{b.contact?.businessName ?? "Advertiser"}</Link>,
                e ? `${e.zoneName} · ${formatIssueMonth(e.issueMonth)}` : "—",
                `${formatPrice(b.priceCents)}${isTestStripeId(b.stripeCustomerId) || charge?.stripe_mode === "test" ? " (test)" : ""}`,
                simplePaymentStatus(charge?.status, ["cancelled","released"].includes(b.status), !!paidReady, !!b.stripePaymentMethodId),
              ];
            })}
          />
          <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} href={href} />
        </>
      )}
    </>
  );
}
