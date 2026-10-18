import Link from "next/link";
import { Suspense } from "react";
import { Filters, pageParam } from "@/components/admin/filters";
import { Badge, EmptyState, LoadError, PageHeader, Pagination, PanelSkeleton } from "@/components/admin/ui";
import { DataTable } from "@/components/ui/data-table";
import { Notice } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { listEditions, listSlots, PAGE_SIZE, searchBookings, type BookingFilter } from "@/lib/admin/data";
import { artworkLabel, positionLabel } from "@/lib/admin/labels";
import { formatIssueMonth, formatTimestamp } from "@/lib/format-admin";

// Review status filters. "Awaiting review" = confirmed reservations not yet reviewed.
const FILTERS: [string, string][] = [
  ["pending", "Awaiting review"],
  ["changes_requested", "Changes requested"],
  ["rejected", "Rejected"],
  ["approved", "Content approved"],
  ["all", "All"],
];

export default function ArtworkPage({ searchParams }: PageProps<"/admin/artwork">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Artwork" description="Uploaded ads with their placement on the postcard." />
      <Notice tone="info" role="note">
        Approval here is <strong>content approval</strong>: you accept what the ad shows. Print readiness is assessed separately
        once the printer&apos;s specifications are confirmed.
      </Notice>
      <Suspense fallback={<PanelSkeleton />}>
        <ArtworkQueue searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ArtworkQueue({ searchParams }: { searchParams: PageProps<"/admin/artwork">["searchParams"] }) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const filter = FILTERS.find(([f]) => f === sp.filter)?.[0] ?? "pending";
  const campaign = typeof sp.campaign === "string" && /^[0-9a-f-]{36}$/.test(sp.campaign) ? sp.campaign : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined;
  const page = pageParam(sp.page);

  let data;
  try {
    const result = await searchBookings(supabase, {
      filter: (filter === "pending" ? "confirmed" : "all") as BookingFilter,
      review: filter === "all" ? undefined : filter,
      editionId: campaign,
      q,
      page,
      extra: "artwork",
    });
    const [editions, slots] = await Promise.all([listEditions(supabase), listSlots(supabase, [...new Set(result.rows.map((b) => b.editionId))])]);
    data = { ...result, editions: new Map(editions.map((e) => [e.id, e])), labels: new Map(slots.map((s) => [s.id, { label: s.label, side: s.side }])) };
  } catch (error) {
    console.error(error instanceof Error ? error.message : "admin artwork failed");
    return <LoadError what="artwork" />;
  }

  const href = (p: number) => {
    const s = new URLSearchParams();
    if (filter !== "pending") s.set("filter", filter);
    if (campaign) s.set("campaign", campaign);
    if (q) s.set("q", q);
    if (p > 1) s.set("page", String(p));
    return `/admin/artwork${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <Filters base="/admin/artwork" filter={filter} filters={FILTERS} q={q} />
      {data.editions.size > 1 && (
        <form action="/admin/artwork" className="flex flex-wrap items-center gap-2 text-sm">
          {filter !== "pending" && <input type="hidden" name="filter" value={filter} />}
          <label htmlFor="campaign-filter" className="text-muted">
            Campaign
          </label>
          <select id="campaign-filter" name="campaign" defaultValue={campaign ?? ""} className="min-w-0 rounded-xl border border-line bg-surface px-3 py-2">
            <option value="">All campaigns</option>
            {[...data.editions.values()].map((e) => (
              <option key={e.id} value={e.id}>
                {e.name ?? `${e.zoneName} · ${formatIssueMonth(e.issueMonth)}`}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-full border border-line px-4 py-2 hover:border-foreground">
            Show
          </button>
        </form>
      )}
      {data.rows.length === 0 ? (
        <EmptyState title="No artwork here." />
      ) : (
        <>
          <DataTable
            caption="Artwork submissions"
            columns={["Advertiser", "Campaign", "Position", "Size", "Submitted", "Status"]}
            rows={data.rows.map((b) => {
              const e = data.editions.get(b.editionId);
              return [
                <Link key="b" href={`/admin/artwork/${b.id}`} className="font-medium underline-offset-4 hover:underline">
                  {b.contact?.businessName}
                </Link>,
                e ? `${e.zoneName} · ${formatIssueMonth(e.issueMonth)}` : "—",
                positionLabel(b, data.labels),
                b.size === "double" ? "Double" : "Standard",
                formatTimestamp(b.artwork?.updatedAt ?? null),
                <Badge key="s" label={artworkLabel(b)} />,
              ];
            })}
          />
          <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} href={href} />
        </>
      )}
    </>
  );
}
