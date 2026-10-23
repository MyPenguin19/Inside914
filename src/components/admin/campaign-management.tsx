import { archiveCampaign, deleteCampaign } from "@/app/admin/admin-actions";
import { requireAdmin } from "@/lib/admin/auth";
import type { AdminEdition } from "@/lib/admin/metrics";
import { isLayoutV2 } from "@/lib/print/layouts";
import { ConfirmAction } from "./confirm-action";
import { LayoutUpgrade } from "./layout-upgrade";

export async function CampaignManagement({ edition }: { edition: AdminEdition }) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_campaign_management", { p_id: edition.id });
  if (error) return <p role="alert">Campaign management is unavailable. No changes can be made.</p>;
  const eligibility = data as { can_delete: boolean; can_archive: boolean };
  return <section id="manage-campaign" aria-label="Manage campaign" className="space-y-4">
    <h2 className="text-lg font-semibold">Manage campaign</h2>
    {edition.archivedAt ? <p>Archived. Reservation, artwork, payment and mailing records are preserved.</p> : <>
      <div className="flex flex-wrap gap-3">
        {eligibility.can_delete && <ConfirmAction label="Delete campaign" confirmationPhrase="DELETE CAMPAIGN" tone="danger" action={deleteCampaign} fields={{id:edition.id}} confirmLabel="Permanently delete" consequence="Permanently remove this unused draft and its empty positions. The audit record remains. This cannot be undone."/>}
        {eligibility.can_archive && <ConfirmAction label="Archive campaign" confirmationPhrase="ARCHIVE CAMPAIGN" action={archiveCampaign} fields={{id:edition.id}} confirmLabel="Archive" consequence="Hide this finished campaign from active lists. All reservation, payment, artwork and mailing records remain accessible under Archived. No payment or refund is requested."/>}
      </div>
      {!eligibility.can_delete && !eligibility.can_archive && <p className="text-sm text-muted">Campaigns with history cannot be deleted. Complete the mailing or use the existing cancellation workflow before archiving.</p>}
      {edition.productModel === "square_v1" && !isLayoutV2(edition.layoutTemplate) && !["completed","cancelled"].includes(edition.status) && <LayoutUpgrade id={edition.id}/>}
    </>}
  </section>;
}
