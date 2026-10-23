"use client";
import { useActionState } from "react";
import { previewLayoutUpgrade, upgradeCampaignLayout } from "@/app/admin/admin-actions";
import { ConfirmAction } from "./confirm-action";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";

export function LayoutUpgrade({ id }: { id: string }) {
  const [state, action, pending] = useActionState(previewLayoutUpgrade, {});
  const preview = state.upgrade;
  return <details className="rounded-2xl border border-line p-4">
    <summary className="cursor-pointer font-medium">Upgrade this V1 campaign to V2</summary>
    <p className="my-3 text-sm text-muted">Pause new reservations first. Existing holds must finish or expire. Review the mapping before confirming; original files and reservation prices are preserved.</p>
    <form action={action}><input type="hidden" name="id" value={id}/><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Checking…" : "Preview upgrade (no changes)"}</Button></form>
    {state.message && <p role="alert" className="mt-3">{state.message}</p>}
    {preview && <div className="mt-4 space-y-3">
      <p role="status">{preview.already ? "This campaign already uses V2." : preview.eligible ? "All ten positions can be mapped safely." : "Upgrade blocked."}</p>
      {preview.reasons.length > 0 && <ul className="list-disc pl-5 text-sm">{preview.reasons.map(r=><li key={r}>{r}</li>)}</ul>}
      {preview.mapping && <DataTable caption="Position mapping (inches)" columns={["Position", "Current size", "V2 size"]} rows={preview.mapping.map(r=>[`${r.side} ${r.label}`,`${r.from.width} × ${r.from.height}`,`${r.to.width} × ${r.to.height}`])}/>}
      {preview.warning && <p className="text-sm">{preview.warning}</p>}
      {preview.eligible && preview.fingerprint && <ConfirmAction label="Upgrade layout to V2" confirmationPhrase="UPGRADE TO V2" action={upgradeCampaignLayout} fields={{id,fingerprint:preview.fingerprint}} confirmLabel="Confirm V2 upgrade" consequence="The same ten slot IDs keep their reservations. All existing artwork approvals must be renewed, and a new printer proof is required. This does not reopen the campaign or charge anyone."/>}
    </div>}
  </details>;
}
