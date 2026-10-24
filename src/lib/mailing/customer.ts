import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ReservationView } from "@/lib/checkout/reservation";
import { customerPaymentStatus,reservationTimeline } from "./timeline";
// Call only after authorizing this booking. No customer contacts, notes or other bookings leave here.
export async function customerMailing(db:SupabaseClient<Database>,view:ReservationView) {
 const [edition,artwork,payment,evidence]=await Promise.all([
  db.from("editions").select("status,mailing_window_start,mailing_window_end").eq("id",view.editionId).single(),
  db.from("booking_artwork").select("review_status").eq("booking_id",view.bookingId).maybeSingle(),
  db.from("zone_charges").select("status,stripe_mode").eq("booking_id",view.bookingId).maybeSingle(),
  db.rpc("customer_mailing_evidence",{p_booking:view.bookingId}),
 ]);
 if(edition.error||artwork.error||payment.error||evidence.error)throw new Error("mailing_status_unavailable");
 const documents=evidence.data.map(({id,kind,title,event_date,published_at})=>({id,kind,title,event_date,published_at}));
 const paymentStatus=customerPaymentStatus(view.status,payment.data);
 return {documents,paymentStatus,windowStart:edition.data.mailing_window_start,windowEnd:edition.data.mailing_window_end,
  timeline:reservationTimeline({confirmed:!!view.confirmedAt,artworkApproved:artwork.data?.review_status==="approved",filled:view.campaign.taken===view.campaign.total&&view.campaign.total>0,paymentStatus,paymentIsTest:view.isTest||payment.data?.stripe_mode==="test",editionStatus:edition.data.status,kinds:documents.map(d=>d.kind)})};
}
