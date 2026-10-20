import { requireAdmin } from "@/lib/admin/auth";
import { getCollectionContext } from "@/lib/payments/environment";
import { activateZone } from "@/app/admin/collection-actions";
import { ConfirmAction } from "./confirm-action";
import { Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { RecoveryLink } from "@/components/payments/recovery-link";
import { simplePaymentStatus } from "@/lib/admin/operations";
import { DataTable } from "@/components/ui/data-table";

export async function CollectionPanel({editionId}:{editionId:string}) {
  const {supabase,now}=await requireAdmin();
  const [{data:preview,error},{data:charges,error:ledgerError},{data:bookings}]=await Promise.all([
    supabase.rpc("admin_collection_preview",{p_id:editionId}),
    supabase.from("zone_charges").select("id,booking_id,status,failure_code,recovery_expires_at").eq("edition_id",editionId).order("created_at"),
    supabase.from("bookings").select("id,reference,booking_contacts(business_name)").eq("edition_id",editionId).not("status","in","(pending,released,cancelled)"),
  ]);
  let configured=true;try {getCollectionContext();} catch {configured=false;}
  const result=preview as {ready?:boolean;existing?:boolean;reason?:string}|null;
  const ready=configured && !error && !ledgerError && result?.ready===true;
  return <Card><h2 className="text-lg font-semibold">Payments for this campaign</h2>
    <p className="mt-2 text-sm text-muted">Advertisers save a card with $0 due when they reserve. Once all 10 spaces are filled and the final postcard proof is approved, review and charge $399 per advertiser ($3,990 total).</p>
    {!configured && <p className="mt-2 text-sm">Charging is currently turned off. Advertisers can still reserve spaces and save their cards.</p>}
    {result?.reason && <p className="mt-2 text-sm">Next: {collectionReason(result.reason)}</p>}
    {result?.ready && !result.existing && <p className="mt-2 text-sm">All payment checks passed. Review the advertisers below before approving collection.</p>}
    {(error || ledgerError) && <p role="alert">Could not verify payment readiness. Collection is blocked.</p>}
    {!!bookings?.length && !charges?.length && <div className="mt-3"><DataTable caption="Payment authorization preview" columns={["Advertiser","Reference","Amount"]} rows={bookings.map(b=>[b.booking_contacts?.business_name ?? "Advertiser",b.reference ?? "—","$399"])}/></div>}
    {!!charges?.length && <p className="mt-3">Payments received: {charges.filter(c=>c.status==="succeeded").length} of 10 · Needs attention: {charges.filter(c=>["requires_action","requires_payment_method","canceled"].includes(c.status)).length}</p>}
    <div className="mt-4">{ready ? <ConfirmAction label="Charge Advertisers & Prepare Mailing" action={activateZone} fields={{id:editionId}} confirmLabel="Confirm payment requests" consequence={<>Request $399 separately for each advertiser in this campaign only. Successful payments are never requested again. Other areas are unchanged.</>}/> : <Button disabled>Charge Advertisers &amp; Prepare Mailing</Button>}</div>
    {!!charges?.length && <div className="mt-4"><DataTable caption="Campaign payments" columns={["Business","Amount","Status","Recovery"]} rows={charges.map(c=>[bookings?.find(b=>b.id===c.booking_id)?.booking_contacts?.business_name ?? "Advertiser","$399",simplePaymentStatus(c.status),["requires_action","requires_payment_method"].includes(c.status) ? (c.recovery_expires_at && Date.parse(c.recovery_expires_at)>now ? <RecoveryLink key={c.id} id={c.id}/> : "Contact the owner for help") : "—"])}/></div>}
    {!!charges?.length && <details className="mt-3 text-sm"><summary>Advanced details</summary>{charges.map(c=><p key={c.id} className="break-all">{c.id}: {c.status}{c.failure_code ? ` · ${c.failure_code}` : ""}</p>)}</details>}
  </Card>;
}

function collectionReason(reason: string) {
  const messages: Record<string, string> = {
    zone_must_be_closed: "Close reservations once all 10 spaces are reserved.",
    printer_layout_not_approved: "Get the postcard layout approved.",
    mailing_window_required: "Set the mailing dates.",
    approved_final_proof_required: "Approve the final printer proof under Advanced / Printer Records.",
    current_final_proof_required: "Approve a new printer proof that includes the current advertiser and house artwork.",
    house_artwork_required: "Upload the permanent house advertisement in Settings.",
    print_resolution_required: "Request higher-resolution advertiser artwork (at least 750 × 750 pixels).",
    ten_positions_required: "This campaign needs all 10 paid positions.",
    ten_confirmed_required: "Wait for all 10 reservations.",
    reservation_not_ready: "Approve every advertisement and check that every advertiser saved a card and authorized payment.",
    inventory_conflict: "Review this campaign’s positions.",
  };
  return messages[reason] ?? "Review the campaign before collecting payment.";
}
