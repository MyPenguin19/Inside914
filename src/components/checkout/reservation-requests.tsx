"use client";
import { useActionState } from "react";
import { submitReservationRequest } from "@/app/reservation/actions";
import { Button } from "@/components/ui/button";
export function ReservationRequests({artworkLocked}:{artworkLocked:boolean}) {
 const [state,action,pending]=useActionState(submitReservationRequest,{});
 return <section className="rounded-2xl border border-line p-6"><h2 className="text-xl font-semibold">Need a change?</h2><p className="my-3 text-sm text-muted">Requests are reviewed by Inside914. They do not immediately change artwork, cancel a reservation or issue a refund. Check this page for the response; replies are not emailed.</p>
  <form action={action} className="space-y-4"><label className="block">Request<select name="kind" className="mt-1 block w-full rounded-xl border border-line bg-surface p-3">{!artworkLocked&&<option value="artwork_change">Change my artwork</option>}<option value="cancellation">Request cancellation</option></select></label>
   {artworkLocked&&<p className="text-sm text-muted">Artwork changes are closed for this campaign.</p>}
   <label className="block">Details<textarea name="message" required maxLength={1000} rows={3} className="mt-1 block w-full rounded-xl border border-line p-3"/></label>
   <Button type="submit" disabled={pending}>{pending?"Sending request…":"Submit request"}</Button>{state.message&&<p role="status">{state.message}</p>}
  </form></section>;
}
