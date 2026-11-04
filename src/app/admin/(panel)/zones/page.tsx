import { formatHouseholds } from "@/lib/format";
import { Suspense } from "react";
import { ZoneForm } from "@/components/admin/zone-form";
import { LoadError, PageHeader, PanelSkeleton } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { listZones } from "@/lib/admin/data";
import { REGIONS } from "@/lib/catalog/regions";
import { FIRST_ZONE } from "@/lib/admin/first-campaign";

export default function ZonesPage() {
  return <div className="flex min-w-0 max-w-3xl flex-col gap-6">
    <PageHeader title="Advertising areas" description="Set up each area once. Create a campaign when you are ready to plan a mailing there." />
    <Suspense fallback={<PanelSkeleton />}><Zones /></Suspense>
  </div>;
}

async function Zones() {
  const { supabase } = await requireAdmin();
  let zones;
  try { zones = await listZones(supabase); } catch { return <LoadError what="the zones" />; }
  const central = zones.find((z) => z.slug === FIRST_ZONE.slug);
  const nextArea = REGIONS.find((area) => !zones.some((zone) => zone.slug === area.slug));
  return <>

    {zones.map((zone) => <Card key={zone.id}><h2 className="mb-4 break-words text-lg font-semibold">{zone.name}</h2><p className="text-sm text-muted">{zone.household_count ? `Approximately ${formatHouseholds(zone.household_count)} homes planned` : "Household estimate not set"}</p><div className="mt-4"><ButtonLink href={`/admin/campaigns/new?area=${encodeURIComponent(zone.slug)}`}>New draft campaign<span className="sr-only"> for {zone.name}</span></ButtonLink></div><details className="mt-5 border-t border-line pt-4"><summary className="cursor-pointer text-sm font-medium">Edit area details</summary><div className="mt-4"><ZoneForm zone={zone} prefix={zone.id} /></div></details></Card>)}
    <Card><h2 className="mb-4 text-lg font-semibold">Add an advertising area</h2><ZoneForm zone={nextArea ? { ...nextArea, household_count: nextArea.slug === FIRST_ZONE.slug ? FIRST_ZONE.household_count : 0 } : { name: "", slug: "", household_count: 0 }} prefix="new-zone" /></Card>
    {central && <details className="text-sm"><summary className="cursor-pointer">Saved campaign proposal</summary><p className="my-3 text-muted">Load the January 2027 proposal. Review its dates before saving.</p><ButtonLink href="/admin/campaigns/new?draft=central-westchester-2027-01" variant="secondary">Prepare January 2027 draft</ButtonLink></details>}
  </>;
}
