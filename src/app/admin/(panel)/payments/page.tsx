import Link from "next/link";
import { Suspense } from "react";
import { Filters, pageParam } from "@/components/admin/filters";
import { Badge, EmptyState, LoadError, PageHeader, Pagination, PanelSkeleton, Stat } from "@/components/admin/ui";
import { DataTable } from "@/components/ui/data-table";
import { Notice, StatusBadge } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { DetailList } from "@/components/admin/ui";
import { Card } from "@/components/ui/primitives";
import { listConsents, listEditionBookings, listEditions, listSlots, PAGE_SIZE, searchBookings, type BookingFilter } from "@/lib/admin/data";
import { paymentLabel, reservationLabel } from "@/lib/admin/labels";
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
      <PageHeader title="Payments" description="Saved cards, authorized amounts and per-zone payment status." />
      <Notice tone="info" role="note">
        Reserved value is <strong>not</strong> collected revenue, and a saved card (a Stripe SetupIntent) is not a payment.
        Collection requires explicit zone activation. Live collection remains disabled pending release approval.
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
    const editions = await listEditions(supabase);
    const requested = typeof sp.campaign === "string" ? sp.campaign : undefined;
    const open = editions.filter((e) => e.status === "open").sort((a, b) => Date.parse(a.artworkDeadline) - Date.parse(b.artworkDeadline));
    const selected = editions.find((e) => e.id === requested) ?? open[0] ?? editions[0] ?? null;
    const [result, all, slots] = await Promise.all([
      searchBookings(supabase, { filter, q, page, extra: "payment" }),
      listEditionBookings(supabase, editions.map((e) => e.id)),
      selected ? listSlots(supabase, [selected.id]) : Promise.resolve([]),
    ]);
    const consents = await listConsents(supabase, [...new Set([...result.rows, ...all.filter(isConfirmed)].map((b) => b.id))]);
    const {data:charges,error:chargeError}=await supabase.from("zone_charges").select("booking_id,amount_cents,status,stripe_mode");
    if(chargeError) throw new Error("Could not load collection ledger");
    data = { charges: new Map(charges.map(c=>[c.booking_id,c])), ...result, all, slots, consents, selected, editionList: editions, editions: new Map(editions.map((e) => [e.id, e])) };
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
    if (p > 1) s.set("page", String(p));
    return `/admin/payments${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      {sel && selStats && (
        <Card as="section" aria-labelledby="readiness-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="readiness-title" className="text-lg font-semibold">
              Readiness: {sel.name ?? `${sel.zoneName} · ${formatIssueMonth(sel.issueMonth)}`}
            </h2>
            {data.editionList.length > 1 && (
              <form action="/admin/payments" className="flex min-w-0 max-w-full items-center gap-2 text-sm">
                <label htmlFor="pay-campaign" className="sr-only">Campaign</label>
                <select id="pay-campaign" name="campaign" defaultValue={sel.id} className="min-w-0 rounded-xl border border-line bg-surface px-3 py-2">
                  {data.editionList.map((e) => (
                    <option key={e.id} value={e.id}>{e.name ?? `${e.zoneName} · ${formatIssueMonth(e.issueMonth)}`}</option>
                  ))}
                </select>
                <button type="submit" className="rounded-full border border-line px-4 py-2 hover:border-foreground">Show</button>
              </form>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            Fully reserved is not the same as payment-ready. Review and authorize each zone from its campaign or production page.
          </p>
          <div className="mt-4">
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
          </div>
        </Card>
      )}

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Stat label="Authorized (all campaigns)" value={formatPrice(authorized)} note={`${confirmed.length} confirmed reservations`} />
        <Stat label="Cards saved" value={`${ready} of ${confirmed.length}`} />
        <Stat label="Collected" value={formatPrice([...data.charges.values()].filter(c=>c.status==="succeeded" && c.stripe_mode==="live").reduce((sum,c)=>sum+c.amount_cents,0))} note="Recorded live payments only; test payments excluded" />
      </section>
      <Filters base="/admin/payments" filter={filter} filters={FILTERS} q={q} />
      {data.rows.length === 0 ? (
        <EmptyState title="No card setups here yet." />
      ) : (
        <>
          <DataTable
            caption="Payment authorizations"
            columns={["Advertiser", "Campaign", "Reference", "Authorized", "Card", "Setup status", "Consent", "Readiness", "Collected", "Collection status", "Reservation", "Updated"]}
            rows={data.rows.map((b) => {
              const e = data.editions.get(b.editionId);
              const devTest = isTestStripeId(b.stripeCustomerId);
              return [
                <Link key="b" href={`/admin/advertisers/${b.id}`} className="font-medium underline-offset-4 hover:underline">
                  {b.contact?.businessName}
                </Link>,
                e ? `${e.zoneName} · ${formatIssueMonth(e.issueMonth)}` : "—",
                b.reference ?? "—",
                <span key="a" className="whitespace-nowrap">
                  {formatPrice(b.priceCents)}
                  {b.pricingMode === "test" && e?.productModel !== "square_v1" && <span className="ml-1.5 text-xs text-warning">test price</span>}
                  {devTest && <span className="ml-1.5 text-xs text-warning">dev TEST</span>}
                </span>,
                <Badge key="p" label={paymentLabel(b)} />,
                b.stripeSetupStatus ?? (b.stripeSetupIntentId ? "started" : "—"),
                data.consents.has(b.id) ? `Yes · ${formatPrice(data.consents.get(b.id)!.amountCents)}` : "No",
                (() => {
                  const r = paymentReadinessDetail(b, data.consents.get(b.id));
                  return r.ready ? (
                    <Badge key="ready" label={{ text: "Payment-ready", tone: "success" }} />
                  ) : (
                    <span key="blk" className="text-xs text-muted" title={r.blockers.join("; ")}>
                      <Badge label={{ text: "Blocked", tone: "warning" }} /> <span className="block pt-1">{r.blockers[0]}</span>
                    </span>
                  );
                })(),
                formatPrice(data.charges.get(b.id)?.status === "succeeded" ? data.charges.get(b.id)!.amount_cents : 0),
                data.charges.has(b.id) ? `${data.charges.get(b.id)!.stripe_mode} · ${data.charges.get(b.id)!.status.replaceAll("_"," ")}` : "Not activated",
                <StatusBadge key="r" tone={reservationLabel(b, now).tone}>{reservationLabel(b, now).text}</StatusBadge>,
                formatTimestamp(b.stripeSetupStatusAt ?? b.confirmedAt ?? b.createdAt),
              ];
            })}
          />
          <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} href={href} />
        </>
      )}
    </>
  );
}
