import { requireAdmin } from "@/lib/admin/auth";
import { getCollectionContext } from "@/lib/payments/environment";
import { activateZone } from "@/app/admin/collection-actions";
import { ConfirmAction } from "./confirm-action";
import { Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { RecoveryLink } from "@/components/payments/recovery-link";
import { DataTable } from "@/components/ui/data-table";

export async function CollectionPanel({editionId}:{editionId:string}) {
  const {supabase,now}=await requireAdmin();
  const [{data:preview,error},{data:charges,error:ledgerError},{data:bookings}]=await Promise.all([
    supabase.rpc("admin_collection_preview",{p_id:editionId}),
    supabase.from("zone_charges").select("id,booking_id,status,failure_code,recovery_expires_at").eq("edition_id",editionId).order("created_at"),
    supabase.from("bookings").select("id,reference,booking_contacts(business_name)").eq("edition_id",editionId).eq("status","reserved"),
  ]);
  let configured=true;let mode:"test"|"live"="test";try {mode=getCollectionContext().mode;} catch {configured=false;}
  const result=preview as {ready?:boolean;existing?:boolean;reason?:string}|null;
  const ready=configured && !error && !ledgerError && result?.ready===true;
  return <Card><h2 className="text-lg font-semibold">Payments for this campaign</h2>
    <p className="mt-2 text-sm text-muted">Advertisers save a card with $0 due when they reserve. Once all 10 spaces are filled and the final postcard proof is approved, review and charge $399 per advertiser ($3,990 total).</p>
    {!configured && <p className="mt-2 text-sm">Charging is currently turned off. Advertisers can still reserve spaces and save their cards.</p>}
    {result?.reason && <p className="mt-2 text-sm">Next: {collectionReason(result.reason)}</p>}
    {result?.ready && !result.existing && <p className="mt-2 text-sm">All payment checks passed. Review the advertisers below before approving collection.</p>}
    {(error || ledgerError) && <p role="alert">Could not verify payment readiness. Collection is blocked.</p>}
    {!!bookings?.length && !charges?.length && <div className="mt-3"><DataTable caption="Payment authorization preview" columns={["Advertiser","Reference","Amount"]} rows={bookings.map(b=>[b.booking_contacts?.business_name ?? "Advertiser",b.reference ?? "—","$399"])}/></div>}
    <div className="mt-4">{ready ? <ConfirmAction label={result?.existing ? `Resume ${mode} collection` : "Review and charge this campaign"} action={activateZone} fields={{id:editionId}} confirmLabel={mode === "live" ? "Confirm ten real payments" : "Confirm ten test payments"} consequence={<>Authorize one $399 {mode === "live" ? "real" : "test"} payment for each of these ten reservations in this zone only. Requests resume with the same payment intents; successful payments cannot be charged twice.</>}/> : <Button disabled>Review and charge this campaign</Button>}</div>
    {!!charges?.length && <div className="mt-4"><DataTable caption="Per-reservation payment status" columns={["Reservation","Amount","Status","Recovery"]} rows={charges.map(c=>[c.booking_id,"$399",c.status.replaceAll("_"," "),["requires_action","requires_payment_method"].includes(c.status) ? (c.recovery_expires_at && Date.parse(c.recovery_expires_at)>now ? <RecoveryLink key={c.id} id={c.id}/> : "Overdue — administrator review required") : "—"])}/></div>}
  </Card>;
}

function collectionReason(reason: string) {
  const messages: Record<string, string> = {
    zone_must_be_closed: "When all 10 spaces are reserved, close reservations from the campaign page.",
    printer_layout_not_approved: "Get the postcard layout approved.",
    mailing_window_required: "Set the campaign mailing dates.",
    approved_final_proof_required: "Approve and publish the final postcard proof, including both house ads.",
    ten_positions_required: "This campaign needs all 10 paid positions.",
    ten_confirmed_required: "Wait until all 10 advertisers have confirmed their reservations.",
    reservation_not_ready: "Approve every advertisement and check that each advertiser has saved a card and authorized payment.",
    inventory_conflict: "Review the campaign positions before collecting payment.",
  };
  return messages[reason] ?? "Review the campaign readiness checklist before collecting payment.";
}
