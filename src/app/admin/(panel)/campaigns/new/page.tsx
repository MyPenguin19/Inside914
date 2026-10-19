import Link from "next/link";
import { Suspense } from "react";
import { createCampaign } from "@/app/admin/admin-actions";
import { CampaignForm } from "@/components/admin/campaign-form";
import { LoadError, PageHeader, PanelSkeleton } from "@/components/admin/ui";
import { Card } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { listZones } from "@/lib/admin/data";
import { FIRST_CAMPAIGN_DEFAULTS, FIRST_ZONE } from "@/lib/admin/first-campaign";
import { SQUARE_TEMPLATE } from "@/lib/admin/layouts";
import { regionalDraftDefaults } from "@/lib/catalog/regions";
import { SQUARE_PRODUCT } from "@/lib/booking/square-product";

export default function NewCampaignPage({ searchParams }: { searchParams: Promise<{ draft?: string; area?: string }> }) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/admin/campaigns" className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
          ← All campaigns
        </Link>
        <div className="mt-2">
          <PageHeader title="New campaign" description="Creates a draft with its advertising spaces. Customers can't see it until you open it." />
        </div>
      </div>
      <Suspense fallback={<PanelSkeleton />}>
        <NewCampaign searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewCampaign({ searchParams }: { searchParams: Promise<{ draft?: string; area?: string }> }) {
  const query = await searchParams;
  const preset = query.draft === "central-westchester-2027-01";
  const { supabase } = await requireAdmin();
  let zones;
  try {
    zones = await listZones(supabase);
  } catch {
    return <LoadError what="the areas" />;
  }
  const central = zones.find((z) => z.name === "Central Westchester") ?? zones[0];
  if (!zones.length) return <Card><p>Create a geographic zone before creating a campaign.</p><Link href="/admin/zones" className="underline">Manage zones</Link></Card>;
  if (preset && !zones.some((z) => z.slug === FIRST_ZONE.slug)) return <Card><p>Create Central Westchester before loading this draft.</p><Link href="/admin/zones" className="underline">Manage zones</Link></Card>;
  const requestedSlug = preset ? FIRST_ZONE.slug : query.area;
  const selected = requestedSlug ? zones.find((zone) => zone.slug === requestedSlug) : central;
  if (!selected) return <Card><p>This area is not configured. Create its zone before preparing a campaign.</p><Link href="/admin/zones" className="underline">Manage zones</Link></Card>;
  return (
    <Card>
      <CampaignForm
        mode="create"
        action={createCampaign}
        zones={zones}
        templates={[SQUARE_TEMPLATE]}
        defaults={{
          zone_id: selected.id,
          ...(query.area ? regionalDraftDefaults(selected) : {}),
          layout_template: SQUARE_TEMPLATE.key,
          unit_price_cents: String(SQUARE_PRODUCT.priceCents / 100),
          double_price_cents: "",
          ...(preset ? FIRST_CAMPAIGN_DEFAULTS : {}),
        }}
      />
    </Card>
  );
}
