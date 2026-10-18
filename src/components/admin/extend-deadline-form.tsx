"use client";

import { useActionState } from "react";
import { extendDeadline, type ActionResult } from "@/app/admin/admin-actions";
import { Button } from "@/components/ui/button";

// New reservation deadline (Westchester time). Artwork and mailing dates only need changing when
// the new deadline would fall after them; blank keeps them as they are.
export function ExtendDeadlineForm({ editionId, artworkDue, windowStart, windowEnd }: { editionId: string; artworkDue: string; windowStart: string; windowEnd: string }) {
  const [state, action, pending] = useActionState(async (prev: ActionResult, form: FormData) => extendDeadline(prev, form), {});
  const field = "rounded-xl border border-line bg-surface px-3 py-2 text-sm";
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={editionId} />
      <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
        New reservation deadline
        <input type="datetime-local" name="reservation_deadline" required className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Artwork due (optional)
        <input type="datetime-local" name="artwork_due_at" className={field} />
      </label>
      <span className="hidden sm:block" />
      <label className="flex flex-col gap-1 text-sm">
        Mailing window: first day (optional)
        <input type="date" name="mailing_window_start" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Mailing window: last day (optional)
        <input type="date" name="mailing_window_end" className={field} />
      </label>
      <p className="text-xs text-muted sm:col-span-2">
        Currently: artwork due {artworkDue || "not set"}, mailing {windowStart || "not set"} – {windowEnd || "not set"}. Leave a date blank to keep it. The campaign
        reopens for reservations; customers aren&apos;t emailed.
      </p>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Extend deadline and reopen"}
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
