import { retryEmail } from "@/app/admin/email-actions";
import { requireAdmin } from "@/lib/admin/auth";
import { ConfirmAction } from "./confirm-action";
const labels:Record<string,string>={pending:"Pending",sending:"Pending — checking provider outcome",accepted:"Sent or accepted",sent:"Sent or accepted",failed:"Failed",investigation:"Requires investigation"};
export async function EmailDeliveryStatus({bookingId}:{bookingId:string}) {
  const {supabase}=await requireAdmin();
  const rows=await supabase.from("email_outbox").select("id,kind,status,provider_message_id").eq("booking_id",bookingId);
  if(rows.error) return <p role="status">Email status is temporarily unavailable.</p>;
  const deliveries=rows.data.length?await supabase.from("email_deliveries").select("id,outbox_id,status,retry_safe,provider_message_id").in("outbox_id",rows.data.map(r=>r.id)):null;
  return <section className="rounded-2xl border border-line p-5"><h2 className="font-semibold">Reservation emails</h2>
    {!rows.data.length && <p className="mt-2 text-sm text-muted">No confirmation email queued yet.</p>}
    {rows.data.map(row=>{const d=deliveries?.data?.find(d=>d.outbox_id===row.id);return <div key={row.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span>{row.kind.replaceAll("_"," ")} · {labels[d?.status??row.status]??"Requires investigation"}</span>
      {d?.status==="failed" && d.retry_safe && !d.provider_message_id && <ConfirmAction label="Retry email" action={retryEmail} fields={{id:d.id}} consequence={<>Queue this definitively rejected message again with its existing link. No reservation changes.</>}/>}
    </div>;})}
    <p className="mt-3 text-xs text-muted">Accepted does not guarantee inbox delivery. Uncertain sends require provider review; retries never revoke a delivered private link.</p>
  </section>;
}
