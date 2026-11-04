import Link from "next/link";
import { Suspense } from "react";
import { ActionCenter } from "@/components/admin/action-center";
import { requireAdmin } from "@/lib/admin/auth";
import { listCampaignSummaries } from "@/lib/admin/data";
import { ButtonLink } from "@/components/ui/button";
import { Card, StatusBadge } from "@/components/ui/primitives";
import { EmptyState, LoadError, PageHeader, PanelSkeleton } from "@/components/admin/ui";
import { formatIssueMonth } from "@/lib/format";

export default function Page() {
  return <Home />;
}

function Home() {
  return <div className="space-y-7">
    <PageHeader title="Manage Inside914" description="Start here. Open a campaign to keep its advertisers, artwork and mailing together.">
      <ButtonLink href="/admin/campaigns/new">New campaign</ButtonLink>
    </PageHeader>
    <Suspense fallback={<PanelSkeleton label="Checking what needs attention…" />}><ActionCenter /></Suspense>
    <Suspense fallback={<PanelSkeleton label="Loading campaigns…" />}><CurrentCampaigns /></Suspense>
    <details className="rounded-2xl border border-line bg-surface p-5">
      <summary className="cursor-pointer font-semibold">How to run a mailing</summary>
      <ol className="mt-5 grid gap-5 sm:grid-cols-2">
        {[
          ["1. Set up a campaign", "Choose one area, set the price and dates, then open reservations.", "/admin/campaigns/new"],
          ["2. Manage advertisers", "Open your campaign to invite businesses and see who has reserved each space.", "/admin/campaigns"],
          ["3. Review artwork", "Check the ads and request changes where needed. Each ad keeps its review history.", "/admin/artwork"],
          ["4. Print & mail", "In your campaign, prepare the postcard, approve the printer’s proof, review payments and record the mailing.", "/admin/campaigns"],
        ].map(([title, description, href]) => <li key={title}><Link href={href} className="font-semibold underline underline-offset-4">{title}</Link><p className="mt-2 text-sm text-muted">{description}</p></li>)}
      </ol>
      <p className="mt-5 border-t border-line pt-4 text-sm text-muted">Advertising areas and the permanent house ad are reusable settings. Set them up once and use them across campaigns.</p>
    </details>
  </div>;
}

async function CurrentCampaigns() {
  const { supabase } = await requireAdmin();
  let campaigns;
  try {
    campaigns = (await listCampaignSummaries(supabase)).slice(0, 6).map(({ edition }) => edition);
  } catch {
    return <LoadError what="your workspace" />;
  }
  return (
    <section aria-labelledby="current-campaigns">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="current-campaigns" className="text-xl font-semibold">Your current campaigns</h2>
        <Link href="/admin/campaigns" className="text-sm underline underline-offset-4">View all campaigns</Link>
      </div>
      {campaigns.length ? <div className="grid gap-4 sm:grid-cols-2">{campaigns.map(e => <Card key={e.id}>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted">{e.zoneName} · {formatIssueMonth(e.issueMonth)}</p><StatusBadge>{e.pausedAt ? "Paused" : e.status === "open" ? "Taking reservations" : e.status.replaceAll("_", " ")}</StatusBadge></div>
        <h3 className="mt-3 text-lg font-semibold">{e.name ?? e.zoneName}</h3>
        <div className="mt-4"><ButtonLink href={`/admin/campaigns/${e.id}`} variant="secondary">Open campaign<span className="sr-only">: {e.name ?? e.zoneName}</span></ButtonLink></div>
      </Card>)}</div> : <EmptyState title="Ready for your next mailing?">Create a campaign to choose its area, price and dates. It starts as a private draft.</EmptyState>}
    </section>
  );
}
