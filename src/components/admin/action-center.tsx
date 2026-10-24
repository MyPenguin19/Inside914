import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { acknowledgeAlert } from "@/app/admin/operations-actions";
import { listEditions,listSlots,listEditionBookings } from "@/lib/admin/data";
import { campaignStats,attentionItems } from "@/lib/admin/metrics";
export async function ActionCenter() {
 const {supabase,now}=await requireAdmin();
 const [alerts,editions]=await Promise.all([supabase.from("operational_alerts").select("id,title,href").is("resolved_at",null).order("created_at",{ascending:false}).limit(12),listEditions(supabase)]);
 const ids=editions.filter(e=>!e.archivedAt).map(e=>e.id);
 const [slots,bookings]=await Promise.all([listSlots(supabase,ids),listEditionBookings(supabase,ids)]);
 const live=editions.flatMap(e=>attentionItems(e,campaignStats(e,slots,bookings,now),[],now).map(item=>({...item,title:`${e.name??e.zoneName}: ${item.title}`})));
 const review=bookings.filter(b=>b.status==="reserved"&&b.artworkReview==="pending").length;
 return <section aria-label="Action needed" className="rounded-2xl border border-line bg-surface p-5"><h2 className="text-xl font-semibold">Action needed</h2>
 {alerts.error&&<p role="alert">Operational alerts are temporarily unavailable.</p>}
 {!alerts.data?.length&&!live.length&&!review&&<p className="mt-3 text-muted">No open operational alerts.</p>}
 {!!review&&<p className="mt-3"><Link className="underline" href="/admin/artwork">{review} advertisements awaiting review</Link></p>}
 {live.map((item,i)=><p className="mt-3" key={`${item.key}:${i}`}><Link className="underline" href={item.href}>{item.title}</Link><span className="block text-sm text-muted">{item.detail}</span></p>)}
 {alerts.data?.map(a=><div className="mt-3 flex flex-wrap justify-between gap-2 text-sm" key={a.id}><Link className="underline" href={a.href}>{a.title}</Link><form action={acknowledgeAlert}><input type="hidden" name="id" value={a.id}/><button className="underline">Dismiss alert</button></form></div>)}
 </section>;
}
