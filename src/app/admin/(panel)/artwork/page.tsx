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

const FILTERS: [BookingFilter, string][] = [
  ["confirmed", "Awaiting review"],
  ["pending", "In checkout"],
  ["all", "All"],
];

export default function ArtworkPage({ searchParams }: PageProps<"/admin/artwork">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Artwork" description="Uploaded ads with their placement on the postcard." />
      <Notice tone="info" role="note">
        Review is read-only for now: approving or requesting changes will be added in a later stage. Every ad on a confirmed
        reservation is listed as awaiting review.
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
  const filter = (FILTERS.find(([f]) => f === sp.filter)?.[0] ?? "confirmed") as BookingFilter;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined;
  const page = pageParam(sp.page);

  let data;
  try {
    const result = await searchBookings(supabase, { filter, q, page, extra: "artwork" });
    const [editions, slots] = await Promise.all([listEditions(supabase), listSlots(supabase, [...new Set(result.rows.map((b) => b.editionId))])]);
    data = { ...result, editions: new Map(editions.map((e) => [e.id, e])), labels: new Map(slots.map((s) => [s.id, { label: s.label, side: s.side }])) };
  } catch (error) {
    console.error(error instanceof Error ? error.message : "admin artwork failed");
    return <LoadError what="artwork" />;
  }

  const href = (p: number) => {
    const s = new URLSearchParams();
    if (filter !== "confirmed") s.set("filter", filter);
    if (q) s.set("q", q);
    if (p > 1) s.set("page", String(p));
    return `/admin/artwork${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <Filters base="/admin/artwork" filter={filter} filters={FILTERS} q={q} />
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
