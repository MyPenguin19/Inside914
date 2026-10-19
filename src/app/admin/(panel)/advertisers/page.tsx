
import { bookingSizeLabel } from "@/lib/booking/products";
import Link from "next/link";
import { Suspense } from "react";
import { Filters, pageParam } from "@/components/admin/filters";
import { Badge, EmptyState, LoadError, PageHeader, Pagination, PanelSkeleton } from "@/components/admin/ui";
import { DataTable } from "@/components/ui/data-table";
import { requireAdmin } from "@/lib/admin/auth";
import { listEditions, listSlots, PAGE_SIZE, searchBookings, type BookingFilter } from "@/lib/admin/data";
import { artworkLabel, paymentLabel, positionLabel, reservationLabel } from "@/lib/admin/labels";
import { formatIssueMonth, formatPhone, formatPrice } from "@/lib/format-admin";

const FILTERS: [BookingFilter, string][] = [
  ["confirmed", "Reserved"],
  ["pending", "Holds"],
  ["ended", "Released"],
  ["all", "All"],
];

export default function AdvertisersPage({ searchParams }: PageProps<"/admin/advertisers">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Advertisers" description="Businesses that entered their details at checkout. Read-only." />
      <Suspense fallback={<PanelSkeleton />}>
        <Advertisers searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Advertisers({ searchParams }: { searchParams: PageProps<"/admin/advertisers">["searchParams"] }) {
  const { supabase, now } = await requireAdmin();
  const sp = await searchParams;
  const filter = (FILTERS.find(([f]) => f === sp.filter)?.[0] ?? "confirmed") as BookingFilter;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined;
  const page = pageParam(sp.page);

  let data;
  try {
    const result = await searchBookings(supabase, { filter, q, page });
    const editionIds = [...new Set(result.rows.map((b) => b.editionId))];
    const [editions, slots] = await Promise.all([listEditions(supabase), listSlots(supabase, editionIds)]);
    data = { ...result, editions: new Map(editions.map((e) => [e.id, e])), labels: new Map(slots.map((s) => [s.id, { label: s.label, side: s.side }])) };
  } catch (error) {
    console.error(error instanceof Error ? error.message : "admin advertisers failed");
    return <LoadError what="advertisers" />;
  }

  const href = (p: number) => {
    const s = new URLSearchParams();
    if (filter !== "confirmed") s.set("filter", filter);
    if (q) s.set("q", q);
    if (p > 1) s.set("page", String(p));
    return `/admin/advertisers${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <Filters base="/admin/advertisers" filter={filter === "confirmed" ? "confirmed" : filter} filters={FILTERS} q={q} />
      {data.rows.length === 0 ? (
        <EmptyState title={q ? `No advertisers match “${q}”.` : "No advertisers here yet."}>
          {filter === "confirmed" && !q && "Confirmed reservations appear here once customers complete checkout."}
        </EmptyState>
      ) : (
        <>
          <DataTable
            caption="Advertisers"
            columns={["Business", "Contact", "Email", "Phone", "Campaign", "Position", "Size", "Reservation", "Artwork", "Payment", "Amount"]}
            rows={data.rows.map((b) => {
              const e = data.editions.get(b.editionId);
              return [
                <Link key="b" href={`/admin/advertisers/${b.id}`} className="font-medium underline-offset-4 hover:underline">
                  {b.contact?.businessName}
                </Link>,
                b.contact?.contactName ?? "—",
                b.contact?.email ?? "—",
                b.contact ? formatPhone(b.contact.phone) : "—",
                e ? `${e.zoneName} · ${formatIssueMonth(e.issueMonth)}` : "—",
                positionLabel(b, data.labels),
                bookingSizeLabel(b.size),
                <Badge key="r" label={reservationLabel(b, now)} />,
                <Badge key="a" label={artworkLabel(b)} />,
                <Badge key="p" label={paymentLabel(b)} />,
                `${formatPrice(b.priceCents)}${b.pricingMode === "test" ? " (test)" : ""}`,
              ];
            })}
          />
          <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} href={href} />
        </>
      )}
    </>
  );
}
