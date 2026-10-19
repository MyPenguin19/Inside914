import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { zoneCampaigns, zoneReadiness } from "@/lib/admin/zone-readiness";
import type { AdminBooking, AdminEdition, AdminSlot } from "@/lib/admin/metrics";
import { formatIssueMonth } from "@/lib/format";

export function ZoneOverview({ editions, slots, bookings, consents }: { editions: AdminEdition[]; slots: AdminSlot[]; bookings: AdminBooking[]; consents: Map<string, { amountCents: number }> }) {
  return <section aria-label="Four-zone overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {zoneCampaigns(editions).map(({slug,name,campaign}) => <Card key={slug}>
      <h2 className="font-semibold">{name}</h2>
      {campaign ? <>
        <p className="mt-2 text-2xl font-semibold">{zoneReadiness(campaign,slots,bookings,consents).validCount} / 10</p>
        <p className="text-sm text-muted">Valid confirmed advertisers</p>
        <p className="mt-2 text-sm">{formatIssueMonth(campaign.issueMonth)} · {campaign.status.replaceAll("_"," ")}</p>
        <Link className="mt-2 inline-block text-sm underline" href={`/admin/campaigns/${campaign.id}`}>Review zone readiness</Link>
      </> : <><p className="mt-2 text-sm text-muted">No active square campaign</p><Link className="mt-2 inline-block text-sm underline" href={`/admin/campaigns/new?area=${slug}`}>Create draft campaign</Link></>}
    </Card>)}
  </section>;
}
