
import { bookingSizeLabel } from "@/lib/booking/products";
import Link from "next/link";
import { Suspense } from "react";
import { Filters, pageParam } from "@/components/admin/filters";
import { Badge, EmptyState, LoadError, PageHeader, Pagination, PanelSkeleton } from "@/components/admin/ui";
import { DataTable } from "@/components/ui/data-table";
import { Notice } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { listEditions, PAGE_SIZE, searchBookings, type BookingFilter } from "@/lib/admin/data";
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
    const [editions, result] = await Promise.all([listEditions(supabase, true), searchBookings(supabase, {
      filter: (filter === "pending" ? "confirmed" : "all") as BookingFilter,
      review: filter === "all" ? undefined : filter,
      editionId: campaign,
      q,
      page,
      extra: "artwork",
    })]);
    data = { ...result, editions: new Map(editions.map((e) => [e.id, e])) };
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
      {campaign && <Link href={`/admin/campaigns/${campaign}?view=artwork`} className="text-sm underline">← Back to this campaign’s artwork</Link>}
      <Filters base="/admin/artwork" filter={filter} filters={FILTERS} q={q} campaign={campaign} campaigns={[...data.editions.values()].map(e => ({id:e.id,label:e.name ?? `${e.zoneName} · ${formatIssueMonth(e.issueMonth)}`}))} />
      {data.rows.length === 0 ? (
        <EmptyState title={filter === "pending" ? "No ads waiting for review." : "No artwork matches these filters."} />
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
                bookingSizeLabel(b.size),
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
