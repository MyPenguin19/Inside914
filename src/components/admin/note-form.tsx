"use client";

import { useActionState, useRef } from "react";
import { addBookingNote, type ActionResult } from "@/app/admin/admin-actions";
import { Button } from "@/components/ui/button";

// Internal note on a reservation (admins only; never shown to the customer).
export function NoteForm({ bookingId }: { bookingId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: ActionResult, form: FormData) => {
    const result = await addBookingNote(prev, form);
    if (result.ok) ref.current?.reset();
    return result;
  }, {});
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="booking_id" value={bookingId} />
      <label htmlFor="note-body" className="text-sm font-medium">
        Add an internal note
      </label>
      <textarea id="note-body" name="body" rows={3} maxLength={2000} required className="rounded-xl border border-line bg-surface px-3 py-2 text-sm" />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Add note"}
        </Button>
        {state.message && (
          <p role="status" className={`text-sm ${state.ok ? "text-accent" : "text-danger"}`}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
