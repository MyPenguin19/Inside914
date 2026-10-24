import { requireAdmin } from "@/lib/admin/auth";
import { resolveCustomerRequest } from "@/app/admin/operations-actions";
import { ConfirmAction } from "./confirm-action";
export async function CustomerRequestList({bookingId}:{bookingId:string}) {
 const {supabase}=await requireAdmin();const rows=await supabase.from("customer_requests").select("id,kind,message,status,response").eq("booking_id",bookingId).order("created_at",{ascending:false});
 if(rows.error) return <p>Customer requests are temporarily unavailable.</p>;
 if(!rows.data.length)return null;
 return <section className="rounded-2xl border border-line p-5"><h2 className="font-semibold">Customer requests</h2>{rows.data.map(r=><article key={r.id} className="mt-4 space-y-2 text-sm"><p className="font-semibold">{r.kind.replaceAll("_"," ")} · {r.status}</p><p className="whitespace-pre-wrap">{r.message}</p>{r.response&&<p>Response: {r.response}</p>}
 {r.status==="open"&&<><p>Review the accepted policy and payment state. Use the existing reservation/artwork controls separately before recording a resolution.</p>
 <ConfirmAction label="Record resolution" fields={{id:r.id,status:"resolved"}} action={resolveCustomerRequest} reasonLabel="Response to advertiser" consequence={<>Record what you resolved. This does not cancel, approve artwork, charge, refund or email anyone.</>}/>
 <ConfirmAction label="Decline request" fields={{id:r.id,status:"declined"}} action={resolveCustomerRequest} reasonLabel="Response to advertiser" consequence={<>Explain why this request cannot be completed.</>}/></>}
 </article>)}</section>;
}
