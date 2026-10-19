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
  return <Card><h2 className="text-lg font-semibold">Zone payment collection</h2>
    <p className="mt-2 text-sm text-muted">Ten separate $399 payments ($3,990 for this zone). Other selected zones are not charged. Final artwork and house ads must be covered by the published final proof.</p>
    {!configured && <p className="mt-2 text-sm">Payment collection is disabled or unavailable. Live collection has not been released.</p>}
    {result?.reason && <p className="mt-2 text-sm">Required: {result.reason.replaceAll("_"," ")}</p>}
    {result?.ready && !result.existing && <p className="mt-2 text-sm">Printer layout and published final proof verified. Ready for administrator authorization.</p>}
    {(error || ledgerError) && <p role="alert">Could not verify payment readiness. Collection is blocked.</p>}
    {!!bookings?.length && !charges?.length && <div className="mt-3"><DataTable caption="Payment authorization preview" columns={["Advertiser","Reference","Amount"]} rows={bookings.map(b=>[b.booking_contacts?.business_name ?? "Advertiser",b.reference ?? "—","$399"])}/></div>}
    <div className="mt-4">{ready ? <ConfirmAction label={result?.existing ? `Resume ${mode} collection` : "Activate & Charge Zone"} action={activateZone} fields={{id:editionId}} confirmLabel={mode === "live" ? "Confirm ten real payments" : "Confirm ten test payments"} consequence={<>Authorize one $399 {mode === "live" ? "real" : "test"} payment for each of these ten reservations in this zone only. Requests resume with the same payment intents; successful payments cannot be charged twice.</>}/> : <Button disabled>Activate &amp; Charge Zone</Button>}</div>
    {!!charges?.length && <div className="mt-4"><DataTable caption="Per-reservation payment status" columns={["Reservation","Amount","Status","Recovery"]} rows={charges.map(c=>[c.booking_id,"$399",c.status.replaceAll("_"," "),["requires_action","requires_payment_method"].includes(c.status) ? (c.recovery_expires_at && Date.parse(c.recovery_expires_at)>now ? <RecoveryLink key={c.id} id={c.id}/> : "Overdue — administrator review required") : "—"])}/></div>}
  </Card>;
}
