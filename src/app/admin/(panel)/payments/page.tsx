import Link from "next/link";
import { Suspense } from "react";
import { Filters, pageParam } from "@/components/admin/filters";
import { Badge, EmptyState, LoadError, PageHeader, Pagination, PanelSkeleton, Stat } from "@/components/admin/ui";
import { DataTable } from "@/components/ui/data-table";
import { Notice, StatusBadge } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { listEditionBookings, listEditions, PAGE_SIZE, searchBookings, type BookingFilter } from "@/lib/admin/data";
import { paymentLabel, reservationLabel } from "@/lib/admin/labels";
import { isConfirmed } from "@/lib/admin/metrics";
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
      <PageHeader title="Payments" description="Saved cards and authorized amounts. Visibility only." />
      <Notice tone="info" role="note">
        Reserved value is <strong>not</strong> collected revenue, and a saved card (a Stripe SetupIntent) is not a payment.
        Nothing is charged until payment collection is built and a campaign is approved.
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
    const [result, all] = await Promise.all([
      searchBookings(supabase, { filter, q, page, extra: "payment" }),
      listEditionBookings(supabase, editions.map((e) => e.id)),
    ]);
    data = { ...result, all, editions: new Map(editions.map((e) => [e.id, e])) };
  } catch (error) {
    console.error(error instanceof Error ? error.message : "admin payments failed");
    return <LoadError what="payments" />;
  }

  const confirmed = data.all.filter(isConfirmed);
  const authorized = confirmed.reduce((sum, b) => sum + b.priceCents, 0);
  const ready = confirmed.filter((b) => b.stripePaymentMethodId).length;
  const href = (p: number) => {
    const s = new URLSearchParams();
    if (filter !== "confirmed") s.set("filter", filter);
    if (q) s.set("q", q);
    if (p > 1) s.set("page", String(p));
    return `/admin/payments${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Stat label="Authorized (all campaigns)" value={formatPrice(authorized)} note={`${confirmed.length} confirmed reservations`} />
        <Stat label="Cards saved" value={`${ready} of ${confirmed.length}`} />
        <Stat label="Collected" value={formatPrice(0)} note="Payment collection isn't built yet" />
      </section>
      <Filters base="/admin/payments" filter={filter} filters={FILTERS} q={q} />
      {data.rows.length === 0 ? (
        <EmptyState title="No card setups here yet." />
      ) : (
        <>
          <DataTable
            caption="Payment authorizations"
            columns={["Advertiser", "Campaign", "Reference", "Authorized", "Card", "Setup status", "Collected", "Reservation", "Updated"]}
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
                  {b.pricingMode === "test" && <span className="ml-1.5 text-xs text-warning">test price</span>}
                  {devTest && <span className="ml-1.5 text-xs text-warning">dev TEST</span>}
                </span>,
                <Badge key="p" label={paymentLabel(b)} />,
                b.stripeSetupStatus ?? (b.stripeSetupIntentId ? "started" : "—"),
                formatPrice(0),
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
