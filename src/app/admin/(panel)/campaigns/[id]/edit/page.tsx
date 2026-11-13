import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { updateCampaign } from "@/app/admin/admin-actions";
import { CampaignForm } from "@/components/admin/campaign-form";
import { LoadError, PageHeader, PanelSkeleton } from "@/components/admin/ui";
import { Card, Notice } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/admin/auth";
import { isoToNyLocal } from "@/lib/admin/campaign-form";
import { hasBookings, getEdition, listZones } from "@/lib/admin/data";
import { LAYOUT_TEMPLATES } from "@/lib/admin/layouts";

export default function EditCampaignPage({ params }: PageProps<"/admin/campaigns/[id]/edit">) {
  return (
    <Suspense fallback={<PanelSkeleton />}>
      <EditCampaign params={params} />
    </Suspense>
  );
}

async function EditCampaign({ params }: { params: PageProps<"/admin/campaigns/[id]/edit">["params"] }) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  let data;
  try {
    const edition = await getEdition(supabase, id);
    if (!edition) notFound();
    const [zones, booked, management] = await Promise.all([listZones(supabase), hasBookings(supabase, id), supabase.rpc("admin_campaign_management", { p_id: id })]);
    if (management.error) throw management.error;
    const areaEditable = !!management.data && typeof management.data === "object" && !Array.isArray(management.data) && management.data.can_change_area === true;
    data = { edition, zones, booked, areaEditable };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return <LoadError what="this campaign" />;
  }
  const { edition: e, zones, booked, areaEditable } = data;
  const finished = e.status === "cancelled" || e.status === "completed";
  const templates = LAYOUT_TEMPLATES.some((t) => t.key === e.layoutTemplate)
    ? LAYOUT_TEMPLATES
    : [{ key: e.layoutTemplate ?? "existing", label: "Existing layout (created before templates)", description: "" }, ...LAYOUT_TEMPLATES];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href={`/admin/campaigns/${e.id}`} className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
          ← Back to campaign
        </Link>
        <div className="mt-2">
          <PageHeader title="Edit campaign" description={e.name ?? e.zoneName} />
        </div>
      </div>
      {finished ? (
        <Notice tone="info" role="note">
          This campaign is {e.status} and can&apos;t be changed.
        </Notice>
      ) : (
        <Card>
          <CampaignForm
            mode="edit"
            id={e.id}
            locked={booked}
            areaEditable={areaEditable}
            action={updateCampaign}
            zones={zones}
            templates={templates}
            defaults={{
              name: e.name ?? `${e.zoneName} · ${e.issueMonth.slice(0, 7)}`,
              zone_id: e.zoneId ?? "",
              issue_month: e.issueMonth.slice(0, 7),
              target_quantity: String(e.targetQuantity ?? e.households),
              reservations_open_at: isoToNyLocal(e.reservationsOpenAt ?? null),
              reservation_deadline: isoToNyLocal(e.artworkDeadline),
              artwork_due_at: isoToNyLocal(e.artworkDueAt ?? e.artworkDeadline),
              mailing_window_start: e.mailingWindowStart ?? e.mailDate ?? "",
              mailing_window_end: e.mailingWindowEnd ?? e.mailDate ?? "",
              layout_template: e.layoutTemplate ?? templates[0].key,
              unit_price_cents: String((e.unitPriceCents ?? 0) / 100),
              double_price_cents: e.doublePriceCents ? String(e.doublePriceCents / 100) : "",
            }}
          />
        </Card>
      )}
    </div>
  );
}
