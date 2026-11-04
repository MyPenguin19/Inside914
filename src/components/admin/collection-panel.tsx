import { formatPrice } from "@/lib/format";
import { getCampaignProduction } from "@/lib/admin/production-data";
import { requireAdmin } from "@/lib/admin/auth";
import { getCollectionContext } from "@/lib/payments/environment";
import { activateZone, reconcilePaymentCancellation } from "@/app/admin/collection-actions";
import { ConfirmAction } from "./confirm-action";
import { Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { RecoveryLink } from "@/components/payments/recovery-link";
import { simplePaymentStatus } from "@/lib/admin/operations";
import { DataTable } from "@/components/ui/data-table";

export async function CollectionPanel({editionId}:{editionId:string}) {
  const {supabase,now}=await requireAdmin();
  const [production, {data:bookings,error:bookingsError}]=await Promise.all([
    getCampaignProduction(supabase, editionId),
    supabase.from("bookings").select("id,reference,price_cents,booking_contacts(business_name)").eq("edition_id",editionId).not("status","in","(pending,released,cancelled)"),
  ]);
  const {data:preview,error}=production.collection;
  const {data:charges,error:ledgerError}=production.ledger;
  let configured=true;try {getCollectionContext();} catch {configured=false;}
  const result=preview as {ready?:boolean;existing?:boolean;reason?:string}|null;
  const controls=charges?.length ? await supabase.from("booking_payment_controls").select("*").in("booking_id",charges.map(c=>c.booking_id)) : {data:[],error:null};
  const houseReady=!!production.houseBytes;
  const ready=houseReady && configured && !error && !ledgerError && !bookingsError && !controls.error && !controls.data?.some(c=>c.revoked_at || c.state==="reconciliation") && result?.ready===true;
  return <Card><h2 className="text-lg font-semibold">Payments for this campaign</h2>
    <p className="mt-2 text-sm text-muted">Advertisers save a card with $0 due when they reserve. Once all 10 spaces are filled and the final postcard proof is approved, review the agreed amounts below. Total authorized: {formatPrice((bookings ?? []).reduce((total,b)=>total+b.price_cents,0))}.</p>
    {!configured && <p className="mt-2 text-sm">Charging is currently turned off. Existing reservations and saved authorizations are preserved.</p>}
    {result?.reason && <p className="mt-2 text-sm">Next: {collectionReason(result.reason)}</p>}
    {configured && houseReady && result?.ready && !result.existing && <p className="mt-2 text-sm">All payment checks passed. Review the advertisers below before approving collection.</p>}
    {(error || ledgerError || bookingsError) && <p role="alert">Could not verify payment readiness. Collection is blocked.</p>}
    {!!bookings?.length && !charges?.length && <div className="mt-3"><DataTable caption="Payment authorization preview" columns={["Advertiser","Reference","Amount"]} rows={bookings.map(b=>[b.booking_contacts?.business_name ?? "Advertiser",b.reference ?? "—",formatPrice(b.price_cents)])}/></div>}
    {!!charges?.length && <p className="mt-3">Payments received: {charges.filter(c=>c.status==="succeeded").length} of 10 · Needs attention: {charges.filter(c=>["requires_action","requires_payment_method","canceled"].includes(c.status)).length}</p>}
    <div className="mt-4">{ready ? <ConfirmAction label="Charge Advertisers & Prepare Mailing" action={activateZone} fields={{id:editionId}} confirmLabel="Confirm payment requests" consequence={<>Request the listed agreed amount separately for each advertiser in this campaign only. Successful payments are never requested again. Other areas are unchanged.</>}/> : <Button disabled>Charge Advertisers &amp; Prepare Mailing</Button>}</div>
    {!!charges?.length && <div className="mt-4"><DataTable caption="Campaign payments" columns={["Business","Amount","Status","Recovery"]} rows={charges.map(c=>[bookings?.find(b=>b.id===c.booking_id)?.booking_contacts?.business_name ?? "Advertiser",formatPrice(c.amount_cents),simplePaymentStatus(c.status),["requires_action","requires_payment_method"].includes(c.status) ? (c.recovery_expires_at && Date.parse(c.recovery_expires_at)>now ? <RecoveryLink key={c.id} id={c.id}/> : "Contact the owner for help") : "—"])}/></div>}
    {!!charges?.length && <details className="mt-3 text-sm"><summary>Advanced details</summary>{charges.map(c=><p key={c.id} className="break-all">{c.id}: {c.status}{c.failure_code ? ` · ${c.failure_code}` : ""}</p>)}</details>}
    {controls.error && <p role="alert">Payment coordination could not be verified. Further collection is blocked.</p>}
    {controls.data?.filter(c=>c.revoked_at || c.state==="reconciliation").map(control=>{
      const charge=charges?.find(c=>c.booking_id===control.booking_id);
      return <div key={control.booking_id} className="mt-3 rounded-xl border border-line p-3 text-sm"><p>Payment {control.state.replaceAll("_"," ")} · {control.revoked_at ? "Authorization revoked. No further collection or recovery is permitted." : "Provider state needs verification."}</p>
        <p>A previously issued payment action may still be in flight. Verify its provider state before completing cancellation. Refunds require a separate decision.</p>
        {configured && charge && control.revoked_at && <ConfirmAction label="Reconcile cancellation" action={reconcilePaymentCancellation} fields={{id:charge.id}} confirmLabel="Verify and cancel unpaid intent" consequence={<>Retrieve this payment’s current state and cancel an unpaid intent if eligible. This never creates a charge or refunds a payment.</>}/>}</div>;
    })}
  </Card>;
}

function collectionReason(reason: string) {
  const messages: Record<string, string> = {
    zone_must_be_closed: "Close reservations once all 10 spaces are reserved.",
    printer_layout_not_approved: "Get the postcard layout approved.",
    mailing_window_required: "Set the mailing dates.",
    approved_final_proof_required: "Approve the final printer proof under Printer proof & records above.",
    current_final_proof_required: "Approve a new printer proof that includes the current advertiser and house artwork.",
    house_artwork_required: "Upload the permanent house advertisement in Settings.",
    print_resolution_required: "Request higher-resolution advertiser artwork (at least 300 effective DPI at its printed size).",
    ten_positions_required: "This campaign needs all 10 paid positions.",
    ten_confirmed_required: "Wait for all 10 reservations.",
    reservation_not_ready: "Approve every advertisement and check that every advertiser saved a card and authorized payment.",
    collection_authorization_revoked: "Resolve the cancellation requests. Revoked authorizations cannot be reused.",
    inventory_conflict: "Review this campaign’s positions.",
  };
  return messages[reason] ?? "Review the campaign before collecting payment.";
}
