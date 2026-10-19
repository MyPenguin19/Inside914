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
    <PageHeader title="Geographic zones" description="Manage geographic areas and provisional household estimates. Creating a zone does not publish a campaign." />
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
    {central && <Card><h2 className="text-lg font-semibold">First campaign</h2><p className="my-3 text-sm text-muted">Load the proposed January 2027 draft. Nothing is saved until you submit the campaign form. Layout approval is still pending.</p><ButtonLink href="/admin/campaigns/new?draft=central-westchester-2027-01">Prepare January 2027 draft</ButtonLink></Card>}
    {zones.map((zone) => <Card key={zone.id}><h2 className="mb-4 break-words text-lg font-semibold">{zone.name}</h2><ZoneForm zone={zone} prefix={zone.id} /><div className="mt-4"><ButtonLink href={`/admin/campaigns/new?area=${encodeURIComponent(zone.slug)}`}>New draft campaign<span className="sr-only"> for {zone.name}</span></ButtonLink></div></Card>)}
    <Card><h2 className="mb-4 text-lg font-semibold">New zone</h2><ZoneForm zone={nextArea ? { ...nextArea, household_count: nextArea.slug === FIRST_ZONE.slug ? FIRST_ZONE.household_count : 0 } : { name: "", slug: "", household_count: 0 }} prefix="new-zone" /></Card>
  </>;
}
