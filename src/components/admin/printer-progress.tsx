"use client";
import { useActionState } from "react";
import { recordPrinterStage } from "@/app/admin/operations-actions";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import type { PrinterOrderEventRow } from "@/lib/supabase/database.types";

export const PRINTER_STAGES = [
  ["submitted", "Submitted to printer"], ["committed", "Accepted / committed by printer"],
  ["printed", "Printed"], ["mailing_submitted", "Submitted for mailing"], ["mailed", "Confirmed mailed"],
] as const;

export function PrinterProgress({ editionId, events, evidence }: { editionId: string; events: PrinterOrderEventRow[]; evidence: {id:string;title:string}[] }) {
  const [state, action, pending] = useActionState(recordPrinterStage, {});
  const next = PRINTER_STAGES.find(([stage]) => !events.some(e => e.stage === stage));
  return <section className="my-4 space-y-3 rounded-xl border border-line p-4">
    <h3 className="font-semibold">Printer order progress</h3>
    <p className="text-sm">{events.length ? PRINTER_STAGES.find(([stage]) => stage === events.at(-1)?.stage)?.[1] : "Not submitted"}</p>
    <p className="text-sm text-muted">Record only what the printer has confirmed. Accepted / committed is the production commitment boundary: cancellation then requires an explicit printer and payment review. This form does not place an order or change customer mailing status.</p>
    {events.map(event => <p key={event.id} className="text-sm">{PRINTER_STAGES.find(([stage]) => stage === event.stage)?.[1]} · {event.recorded_at.slice(0,10)} · {event.notes}</p>)}
    {next && <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="editionId" value={editionId} /><input type="hidden" name="stage" value={next[0]} />
      <SelectField id="printerEvidence" name="evidenceId" label="Supporting evidence" required defaultValue=""><option value="">Select an uploaded document</option>{evidence.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</SelectField>
      <TextField id="printerNotes" name="notes" label="What did the printer confirm?" required maxLength={1000} />
      <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="confirmed" required className="mt-1" />I verified this milestone against the selected document.</label>
      <Button type="submit" disabled={pending || !evidence.length}>{pending ? "Recording…" : `Record: ${next[1]}`}</Button>
    </form>}
    {state.message && <p role="status" className="text-sm">{state.message}</p>}
  </section>;
}
