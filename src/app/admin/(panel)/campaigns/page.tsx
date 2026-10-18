import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, LoadError, PageHeader, PanelSkeleton } from "@/components/admin/ui";
import { DataTable } from "@/components/ui/data-table";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { listEditionBookings, listEditions, listSlots } from "@/lib/admin/data";
import { campaignStats } from "@/lib/admin/metrics";
import { formatDay, formatDeadline, formatIssueMonth, formatPrice } from "@/lib/format";

const STATUSES = ["all", "open", "draft", "closed", "approved_to_print", "printed", "cancelled"] as const;

export default function CampaignsPage({ searchParams }: PageProps<"/admin/campaigns">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Campaigns" description="Every campaign (edition) in the database.">
        <ButtonLink href="/admin/campaigns/new">New campaign</ButtonLink>
      </PageHeader>
      <Suspense fallback={<PanelSkeleton />}>
        <Campaigns searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Campaigns({ searchParams }: { searchParams: PageProps<"/admin/campaigns">["searchParams"] }) {
  const { supabase, now } = await requireAdmin();
  const { status: raw } = await searchParams;
  const status = STATUSES.includes(raw as (typeof STATUSES)[number]) ? (raw as string) : "all";

  let rows;
  try {
    const editions = (await listEditions(supabase)).filter((e) => status === "all" || e.status === status);
    const ids = editions.map((e) => e.id);
    const [slots, bookings] = await Promise.all([listSlots(supabase, ids), listEditionBookings(supabase, ids)]);
    rows = editions.map((e) => ({ edition: e, stats: campaignStats(e, slots, bookings, now) }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "admin campaigns failed");
    return <LoadError what="campaigns" />;
  }

  return (
    <>
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/admin/campaigns" : `/admin/campaigns?status=${s}`}
            aria-current={status === s ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 ${status === s ? "border-foreground bg-foreground text-background" : "border-line hover:border-foreground"}`}
          >
            {s === "all" ? "All" : s.replaceAll("_", " ")}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="No campaigns match this filter." />
      ) : (
        <DataTable
          caption="Campaigns"
          columns={["Campaign", "Edition", "Mail date", "Reserve by", "Status", "Reserved", "Advertisers", "Reserved value"]}
          rows={rows.map(({ edition: e, stats }) => [
            <Link key="n" href={`/admin/campaigns/${e.id}`} className="font-medium underline-offset-4 hover:underline">
              {e.name ?? e.zoneName}
            </Link>,
            `${e.zoneName} · ${formatIssueMonth(e.issueMonth)}`,
            e.mailDate ? formatDay(e.mailDate) : "Not set",
            formatDeadline(e.artworkDeadline),
            <StatusBadge key="s" tone={e.status === "open" && !e.pausedAt ? "success" : e.pausedAt ? "warning" : "neutral"}>
              {e.status.replaceAll("_", " ")}
              {e.pausedAt ? " · paused" : ""}
            </StatusBadge>,
            `${stats.reservedUnits} of ${stats.totalUnits}`,
            String(stats.advertisers),
            formatPrice(stats.reservedValueCents),
          ])}
        />
      )}
    </>
  );
}
