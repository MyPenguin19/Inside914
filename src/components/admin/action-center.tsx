import { ownerNotificationsConfigured } from "@/lib/operations/notifications";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { acknowledgeAlert } from "@/app/admin/operations-actions";
import { listCampaignSummaries } from "@/lib/admin/data";
import { campaignStats, attentionItems, artworkAwaitingReview } from "@/lib/admin/metrics";
import { LoadError } from "./ui";
import { formatTimestamp } from "@/lib/format-admin";

export async function ActionCenter() {
  const { supabase, now } = await requireAdmin();
  let data;
  try {
    const [alerts, summaries] = await Promise.all([
      supabase.from("operational_alerts").select("id,title,href,created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(12),
      listCampaignSummaries(supabase),
    ]);
    const live = summaries.flatMap(({ edition: e, slots, bookings }) => attentionItems(e, campaignStats(e, slots, bookings, now), [], now).map(item => ({ ...item, title: `${e.name ?? e.zoneName}: ${item.title}` })));
    data = { alerts, live, review: summaries.reduce((total, s) => total + s.bookings.filter(artworkAwaitingReview).length, 0) };
  } catch {
    return <LoadError what="items needing attention" />;
  }
  const { alerts, live, review } = data;
  const groups = Map.groupBy(alerts.data ?? [], alert => alert.title);
  return <section aria-label="Action needed" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
    <h2 className="text-xl font-semibold">Needs your attention</h2>
    {alerts.error && <p role="alert" className="mt-3 text-sm">Some alerts could not be loaded. Please refresh to check again.</p>}
    {!alerts.error && !alerts.data?.length && !live.length && !review && <p className="mt-3 text-muted">You’re caught up. Open a campaign below to keep working.</p>}
    <div className="mt-2 divide-y divide-line">
      {!!review && <div className="py-3"><Link className="font-medium underline underline-offset-4" href="/admin/artwork">Review {review} {review === 1 ? "ad" : "ads"}</Link><p className="mt-1 text-sm text-muted">New artwork is ready for you to check.</p></div>}
      {live.map((item, i) => <div className="py-3" key={`${item.key}:${i}`}><Link className="font-medium underline underline-offset-4" href={item.href}>{item.title}</Link><p className="mt-1 text-sm text-muted">{item.detail}</p></div>)}
      {[...groups].map(([title, items]) => <details key={title} className="py-3 text-sm">
        <summary className="cursor-pointer font-medium">{title} <span className="ml-2 rounded-full bg-background-soft px-2 py-1 text-xs text-muted">{items.length} {items.length === 1 ? "update" : "updates"}</span></summary>
        <ul className="mt-3 divide-y divide-line">{items.map(a => <li className="flex flex-wrap items-center justify-between gap-3 py-2" key={a.id}>
          <div><Link className="underline underline-offset-4" href={a.href}>Open details</Link><p className="mt-1 text-xs text-muted">{formatTimestamp(a.created_at)}</p></div>
          <form action={acknowledgeAlert}><input type="hidden" name="id" value={a.id} /><button className="min-h-11 rounded-lg border border-line px-3">Dismiss alert</button></form>
        </li>)}</ul>
      </details>)}
    </div>
    {!ownerNotificationsConfigured() && <p className="mt-3 text-xs text-muted">Email updates are off. Check Home for new alerts.</p>}
  </section>;
}
