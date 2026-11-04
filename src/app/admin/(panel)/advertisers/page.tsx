
import Link from "next/link";
import { Suspense } from "react";
import { Filters, pageParam } from "@/components/admin/filters";
import { Badge, EmptyState, LoadError, PageHeader, Pagination, PanelSkeleton } from "@/components/admin/ui";
import { DataTable } from "@/components/ui/data-table";
import { requireAdmin } from "@/lib/admin/auth";
import { listCartZones, listEditions, PAGE_SIZE, searchBookings, type BookingFilter } from "@/lib/admin/data";
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
      <PageHeader title="Advertisers" description="Contact details, reserved positions, artwork and saved cards." />
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
  const campaign = typeof sp.campaign === "string" && /^[0-9a-f-]{36}$/.test(sp.campaign) ? sp.campaign : undefined;

  let data;
  try {
    const [result, editions] = await Promise.all([searchBookings(supabase, { filter, q, page, editionId: campaign }), listEditions(supabase, true)]);
    const cartZones = await listCartZones(supabase, [...new Set(result.rows.flatMap(b => b.cartId ? [b.cartId] : []))]);
    data = { cartZones, ...result, editions: new Map(editions.map((e) => [e.id, e])) };
  } catch (error) {
    console.error(error instanceof Error ? error.message : "admin advertisers failed");
    return <LoadError what="advertisers" />;
  }

  const href = (p: number) => {
    const s = new URLSearchParams();
    if (filter !== "confirmed") s.set("filter", filter);
    if (q) s.set("q", q);
    if (campaign) s.set("campaign", campaign);
    if (p > 1) s.set("page", String(p));
    return `/admin/advertisers${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      {campaign && <Link href={`/admin/campaigns/${campaign}?view=advertisers`} className="text-sm underline">← Back to this campaign’s advertisers</Link>}
      <Filters base="/admin/advertisers" filter={filter} filters={FILTERS} q={q} campaign={campaign} campaigns={[...data.editions.values()].map(e => ({id:e.id,label:e.name ?? `${e.zoneName} · ${formatIssueMonth(e.issueMonth)}`}))} />
      {data.rows.length === 0 ? (
        <EmptyState title={q ? `No advertisers match “${q}”.` : "No advertisers here yet."}>
          {filter === "confirmed" && !q && "Confirmed reservations appear here once customers complete checkout."}
        </EmptyState>
      ) : (
        <>
          <DataTable
            caption="Advertisers"
            columns={["Business / contact", "Campaign / space", "Reservation", "Artwork", "Card / amount"]}
            rows={data.rows.map((b) => {
              const e = data.editions.get(b.editionId);
              return [
                <div key="b"><Link href={`/admin/advertisers/${b.id}`} className="font-medium underline underline-offset-4">{b.contact?.businessName ?? "No business details yet"}</Link>
                  {b.contact && <div className="mt-1 text-xs text-muted"><p>{b.contact.contactName}</p><p className="break-all">{b.contact.email}</p><p>{formatPhone(b.contact.phone)}</p></div>}</div>,
                <div key="campaign">{e ? <Link href={`/admin/campaigns/${e.id}?view=advertisers`} className="underline underline-offset-4">{e.name ?? `${e.zoneName} · ${formatIssueMonth(e.issueMonth)}`}</Link> : "—"}<p className="mt-1 text-xs text-muted">{positionLabel(b, data.labels)}</p>{b.cartId && <p className="mt-1 text-xs text-muted">Selected areas: {data.cartZones.get(b.cartId)?.join(", ") ?? e?.zoneName ?? "—"}</p>}</div>,
                <Badge key="r" label={reservationLabel(b, now)} />,
                <Badge key="a" label={artworkLabel(b)} />,
                <div key="p"><Badge label={paymentLabel(b)} /><p className="mt-1 text-sm">{formatPrice(b.priceCents)}{b.pricingMode === "test" ? " (test)" : ""}</p></div>,
              ];
            })}
          />
          <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} href={href} />
        </>
      )}
    </>
  );
}
