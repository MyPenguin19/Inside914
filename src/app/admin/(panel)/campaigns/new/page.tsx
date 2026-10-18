import Link from "next/link";
import { Suspense } from "react";
import { createCampaign } from "@/app/admin/admin-actions";
import { CampaignForm } from "@/components/admin/campaign-form";
import { LoadError, PageHeader, PanelSkeleton } from "@/components/admin/ui";
import { Card } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { listZones } from "@/lib/admin/data";
import { LAYOUT_TEMPLATES } from "@/lib/admin/layouts";
import { LAUNCH_PRICES } from "@/lib/pricing";

export default function NewCampaignPage() {
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
        <NewCampaign />
      </Suspense>
    </div>
  );
}

async function NewCampaign() {
  const { supabase } = await requireAdmin();
  let zones;
  try {
    zones = await listZones(supabase);
  } catch {
    return <LoadError what="the areas" />;
  }
  const central = zones.find((z) => z.name === "Central Westchester") ?? zones[0];
  return (
    <Card>
      <CampaignForm
        mode="create"
        action={createCampaign}
        zones={zones}
        templates={LAYOUT_TEMPLATES}
        defaults={{
          zone_id: central?.id ?? "",
          layout_template: LAYOUT_TEMPLATES[0].key,
          unit_price_cents: String(LAUNCH_PRICES.unitPriceCents / 100),
          double_price_cents: String(LAUNCH_PRICES.doublePriceCents / 100),
        }}
      />
    </Card>
  );
}
