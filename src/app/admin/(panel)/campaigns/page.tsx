import { ActionCenter } from "@/components/admin/action-center";
import { layoutVersion } from "@/lib/print/layouts";
import { isConfirmed } from "@/lib/admin/metrics";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, LoadError, PageHeader, PanelSkeleton } from "@/components/admin/ui";
import { DataTable } from "@/components/ui/data-table";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge, Notice } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { listEditionBookings, listEditions, listSlots } from "@/lib/admin/data";
import { campaignStats, deadlineMissed } from "@/lib/admin/metrics";
import { formatDay, formatIssueMonth, formatPrice } from "@/lib/format";

const STATUSES = ["active", "draft", "archived"] as const;

export default function CampaignsPage({ searchParams }: PageProps<"/admin/campaigns">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Campaigns" description="Create a campaign, review its advertisers and artwork, then prepare the mailing.">
        <ButtonLink href="/admin/zones" variant="secondary">Manage areas</ButtonLink>
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
  const status = STATUSES.includes(raw as (typeof STATUSES)[number]) ? (raw as string) : "active";

  let rows;
  try {
    const editions = (await listEditions(supabase, true)).filter((e) => status === "archived" ? !!e.archivedAt : !e.archivedAt && (status === "active" || e.status === "draft"));
    const ids = editions.map((e) => e.id);
    const [slots, bookings] = await Promise.all([listSlots(supabase, ids), listEditionBookings(supabase, ids)]);
    rows = editions.map((e) => ({ edition: e, stats: campaignStats(e, slots, bookings, now), approved: bookings.filter(b=>b.editionId===e.id && isConfirmed(b) && b.artworkReview==="approved").length, hasHistory: bookings.some(b=>b.editionId===e.id) }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "admin campaigns failed");
    return <LoadError what="campaigns" />;
  }

  return (
    <>
      {rows.filter(r=>deadlineMissed(r.edition,r.stats,now)).map(({edition:e,stats})=><Notice key={e.id} tone="warning" role="note">
        <strong>Campaign needs action: {e.name??e.zoneName}</strong>
        <p>{e.zoneName} · Deadline {formatDay(e.artworkDeadline)} · {stats.reservedUnits}/{stats.sellableUnits} filled · {stats.sellableUnits-stats.reservedUnits} missing.</p>
        <p>Confirmed reservations and their agreed amounts are unchanged. No automatic cancellation or charge.</p>
        <Link className="underline" href={`/admin/campaigns/${e.id}#status-title`}>Review amounts, extend deadline or cancel campaign</Link>
      </Notice>)}
      <ActionCenter />
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === "active" ? "/admin/campaigns" : `/admin/campaigns?status=${s}`}
            aria-current={status === s ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 ${status === s ? "border-foreground bg-foreground text-background" : "border-line hover:border-foreground"}`}
          >
            {s[0].toUpperCase()+s.slice(1)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="No campaigns match this filter." />
      ) : (
        <DataTable
          caption="Campaigns"
          columns={["Campaign / area", "Layout", "Price per position", "Status", "Reserved", "Artwork approved", "Mailing", "Actions"]}
          rows={rows.map(({ edition: e, stats, approved, hasHistory }) => [
            <Link key="n" href={`/admin/campaigns/${e.id}`} className="font-medium underline-offset-4 hover:underline">
              {e.name ?? e.zoneName}<span className="block text-xs text-muted">{e.zoneName} · {formatIssueMonth(e.issueMonth)}</span>
            </Link>,
            layoutVersion(e.layoutTemplate),
            formatPrice(e.unitPriceCents ?? 0),
            <StatusBadge key="s" tone={e.status === "open" && !e.pausedAt ? "success" : e.pausedAt ? "warning" : "neutral"}>
              {e.archivedAt ? "Archived" : e.status.replaceAll("_", " ")}
              {e.pausedAt ? " · paused" : ""}
            </StatusBadge>,
            `${stats.reservedUnits} of ${stats.totalUnits}`,
            `${approved} of ${stats.reservations}`,
            ["printed","mailed","completed"].includes(e.status) ? e.status : e.mailDate ? `Planned ${formatDay(e.mailDate)}` : "Not scheduled",
            <div key="actions" className="flex flex-wrap gap-3">
              {!e.archivedAt && !["cancelled","completed"].includes(e.status) && <Link href={`/admin/campaigns/${e.id}/edit`} className="underline">Edit</Link>}
              <Link href={`/admin/campaigns/${e.id}#manage-campaign`} className="underline">{e.archivedAt ? "View" : ["cancelled","completed"].includes(e.status) ? "Archive" : e.status==="draft" && !hasHistory ? "Manage / Delete" : "Manage"}</Link>
            </div>,
          ])}
        />
      )}
    </>
  );
}
