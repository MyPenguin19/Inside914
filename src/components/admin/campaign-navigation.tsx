import Link from "next/link";
import { CAMPAIGN_SECTIONS, campaignHref, type CampaignSection } from "@/lib/admin/workflow";

export function CampaignNavigation({ id, current }: { id: string; current: CampaignSection }) {
  return <nav aria-label="Campaign workspace" className="flex flex-wrap gap-2 border-b border-line pb-4">
    {CAMPAIGN_SECTIONS.map(({ key, label }) => <Link key={key} href={campaignHref(id, key)} aria-current={key === current ? "page" : undefined}
      className={`rounded-xl px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${key === current ? "bg-foreground text-background" : "bg-surface text-muted hover:bg-background-soft hover:text-foreground"}`}>{label}</Link>)}
  </nav>;
}
