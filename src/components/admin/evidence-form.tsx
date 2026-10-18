"use client";

import { useActionState, useRef, useState } from "react";
import { startEvidenceUpload, uploadEvidence, type ActionResult } from "@/app/admin/admin-actions";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";

const KINDS: [string, string][] = [
  ["printer_confirmation", "Printer confirmation"],
  ["final_proof", "Final approved postcard proof"],
  ["postal_acceptance", "Postal acceptance receipt"],
  ["mailing_confirmation", "Mailing provider confirmation"],
  ["other", "Other"],
];

function put(url: string, file: File) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("content-type", file.type);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

// Genuine fulfillment documents only. Files go straight to private storage; the server checks them
// and records the evidence unpublished. Quantities are optional and entered exactly as documented.
export function EvidenceForm({ editionId }: { editionId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(async (prev: ActionResult, form: FormData) => {
    setUploadError(null);
    const file = form.get("file");
    form.delete("file");
    if (file instanceof File && file.size > 0) {
      setUploading(true);
      try {
        const ticket = await startEvidenceUpload({ editionId, contentType: file.type, size: file.size });
        if (!ticket.ok) return { message: ticket.message };
        await put(ticket.uploadUrl, file);
        form.set("storage_path", ticket.path);
      } catch {
        return { message: "The upload was interrupted. Nothing was saved." };
      } finally {
        setUploading(false);
      }
    }
    const result = await uploadEvidence(prev, form);
    if (result.ok) formRef.current?.reset();
    return result;
  }, {});

  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      <input type="hidden" name="edition_id" value={editionId} />
      <SelectField id="kind" label="Type of document" required defaultValue="printer_confirmation">
        {KINDS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </SelectField>
      <TextField id="title" label="Title" required maxLength={200} placeholder="e.g. Printer invoice #1042" />
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor="file" className="text-sm font-medium">
          File <span className="font-normal text-muted">(PDF, JPG or PNG, up to 10 MB)</span>
        </label>
        <input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png" className="text-sm" />
      </div>
      <TextField id="quantity_printed" label="Quantity printed" type="number" min={0} optional hint="Only if the document states it." />
      <TextField id="quantity_accepted" label="Quantity accepted for mailing" type="number" min={0} optional hint="Only if the document states it." />
      <TextField id="event_date" label="Date on the document" type="date" optional />
      <TextField id="notes" label="Notes" optional maxLength={2000} />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending || uploading}>
          {uploading ? "Uploading…" : pending ? "Saving…" : "Save evidence"}
        </Button>
        {(state.message || uploadError) && (
          <p role="status" className={`text-sm ${state.ok ? "text-accent" : "text-danger"}`}>
            {state.message ?? uploadError}
          </p>
        )}
      </div>
    </form>
  );
}
