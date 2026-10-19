import { ZoneOverview } from "@/components/admin/zone-overview";
import Link from "next/link";
import { Suspense } from "react";
import { DetailList, LoadError, PageHeader, PanelSkeleton, Stat } from "@/components/admin/ui";
import { Card, Notice, StatusBadge } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { listConsents, listEditionBookings, listEditions, listSentEmails, listSlots } from "@/lib/admin/data";
import { attentionItems, campaignStats, recentActivity, type AdminEdition } from "@/lib/admin/metrics";
import { formatDay, formatDeadline, formatHouseholds, formatIssueMonth, formatPrice } from "@/lib/format";

export default function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<PanelSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}

// The campaign shown: the one asked for, else the open edition with the nearest deadline, else the newest.
function pickCampaign(editions: AdminEdition[], requested: string | undefined) {
  const open = editions.filter((e) => e.status === "open").sort((a, b) => Date.parse(a.artworkDeadline) - Date.parse(b.artworkDeadline));
  return editions.find((e) => e.id === requested) ?? open[0] ?? editions[0] ?? null;
}

async function Overview({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  const { supabase, now } = await requireAdmin();
  const { campaign: requested } = await searchParams;

  let data;
  try {
    const editions = await listEditions(supabase);
    const edition = pickCampaign(editions, typeof requested === "string" ? requested : undefined);
    const ids = editions.filter(e => e.productModel === "square_v1" || e.id === edition?.id).map(e => e.id);
    const [allSlots, allBookings] = await Promise.all([listSlots(supabase, ids), listEditionBookings(supabase, ids)]);
    const consents = await listConsents(supabase, allBookings.map(b => b.id));
    const slots = allSlots.filter(s => s.editionId === edition?.id), bookings = allBookings.filter(b => b.editionId === edition?.id);
    const emails = await listSentEmails(supabase, bookings.map((b) => b.id));
    data = { editions, edition, slots, bookings, emails, allSlots, allBookings, consents };
  } catch (error) {
    console.error(error instanceof Error ? error.message : "admin overview failed");
    return <LoadError what="the dashboard" />;
  }

  const { editions, edition, slots, bookings, emails } = data;
  if (!edition) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Overview" />
        <ZoneOverview editions={[]} slots={[]} bookings={[]} consents={new Map()} />
        <Card>
          <p className="font-medium">No campaigns yet.</p>
          <p className="mt-1 text-sm text-muted">Create a draft campaign from the zone cards above.</p>
        </Card>
      </div>
    );
  }

  const stats = campaignStats(edition, slots, bookings, now);
  const attention = attentionItems(edition, stats, bookings, now);
  const activity = recentActivity(bookings, emails);

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Overview"
        description={`${edition.zoneName} · ${formatIssueMonth(edition.issueMonth)} edition`}
      >
        {editions.length > 1 && (
          <form className="flex w-full min-w-0 flex-wrap items-center gap-2 text-sm sm:w-auto" action="/admin">
            <label htmlFor="campaign" className="text-muted">
              Campaign
            </label>
            <select id="campaign" name="campaign" defaultValue={edition.id} className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 sm:flex-none">
              {editions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.zoneName} · {formatIssueMonth(e.issueMonth)} ({e.status})
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-full border border-line px-4 py-2 hover:border-foreground">
              Show
            </button>
          </form>
        )}
      </PageHeader>

      <ZoneOverview editions={editions} slots={data.allSlots} bookings={data.allBookings} consents={data.consents} />

      {edition.productModel !== "square_v1" && stats.testPricedReservations > 0 && (
        <Notice tone="warning" role="note">
          {stats.testPricedReservations} of {stats.reservations} reservations use the temporary test prices. Amounts below are
          what each booking actually stores.
        </Notice>
      )}

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <Stat label="Reserved spaces" value={`${stats.reservedUnits} of ${stats.totalUnits}`} note={`${stats.reservations} ${stats.reservations === 1 ? "reservation" : "reservations"}`} href={`/admin/campaigns/${edition.id}`} />
        <Stat label="Available spaces" value={String(stats.availableUnits)} note={stats.heldUnits ? `${stats.heldUnits} on hold right now` : "None on hold right now"} />
        <Stat label="Advertisers" value={String(stats.advertisers)} href="/admin/advertisers" />
        <Stat label="Reserved advertising value" value={formatPrice(stats.reservedValueCents)} note="Authorized, not collected" href="/admin/payments" />
        <Stat label="Payment methods ready" value={`${stats.paymentMethodsReady} of ${stats.reservations}`} href="/admin/payments" />
        <Stat label="Artwork awaiting review" value={String(stats.artworkAwaitingReview)} href="/admin/artwork" />
      </section>

      <section aria-labelledby="progress-title">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="progress-title" className="text-lg font-semibold">
              Campaign progress
            </h2>
            <StatusBadge tone={edition.status === "open" ? "success" : "neutral"}>{edition.status}</StatusBadge>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">Inventory filled</span>
              <span className="font-medium">{stats.filledPercent}%</span>
            </div>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-background-soft" aria-hidden="true">
              <div className="bg-accent" style={{ width: `${(stats.reservedUnits / Math.max(1, stats.totalUnits)) * 100}%` }} />
              <div className="bg-info/60" style={{ width: `${(stats.heldUnits / Math.max(1, stats.totalUnits)) * 100}%` }} />
            </div>
          </div>
          <div className="mt-5">
            <DetailList
              rows={[
                ["Campaign", `${edition.zoneName} · ${formatIssueMonth(edition.issueMonth)}`],
                ["Reservation deadline", formatDeadline(edition.artworkDeadline)],
                ["Planned mail date", edition.mailDate ? formatDay(edition.mailDate) : "Not set"],
                ["Planned mailing quantity", `≈ ${formatHouseholds(edition.households)} homes`],
                ["Total units", String(stats.totalUnits)],
                ["Reserved · held · available", `${stats.reservedUnits} · ${stats.heldUnits} · ${stats.availableUnits}`],
              ]}
            />
          </div>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="attention-title">
          <h2 id="attention-title" className="text-lg font-semibold">
            Requires attention
          </h2>
          {attention.length === 0 ? (
            <Card className="mt-3">
              <p className="font-medium">You&apos;re all caught up.</p>
              <p className="mt-1 text-sm text-muted">Nothing needs a decision right now.</p>
            </Card>
          ) : (
            <ul className="mt-3 grid gap-2">
              {attention.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="block rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
                    <span className="flex items-start gap-3">
                      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.tone === "danger" ? "bg-danger" : item.tone === "warning" ? "bg-warning" : "bg-info"}`} />
                      <span>
                        <span className="block font-medium">{item.title}</span>
                        <span className="block text-sm text-muted">{item.detail}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="activity-title">
          <h2 id="activity-title" className="text-lg font-semibold">
            Recent activity
          </h2>
          {activity.length === 0 ? (
            <Card className="mt-3">
              <p className="font-medium">No activity yet.</p>
              <p className="mt-1 text-sm text-muted">
                Confirmed reservations, failed card setups and sent confirmation emails appear here. A full event log isn&apos;t
                recorded yet.
              </p>
            </Card>
          ) : (
            <ol className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
              {activity.map((a) => (
                <li key={a.at + a.title + a.detail} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    <span className="block font-medium">{a.href ? <Link href={a.href} className="hover:underline">{a.title}</Link> : a.title}</span>
                    <span className="block text-muted">{a.detail}</span>
                  </span>
                  <time dateTime={a.at} className="shrink-0 text-xs text-muted">
                    {new Date(a.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
