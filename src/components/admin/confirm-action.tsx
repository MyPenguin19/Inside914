"use client";

import { useActionState, useId, useState } from "react";
import type { ActionResult } from "@/app/admin/admin-actions";
import { Button } from "@/components/ui/button";

// A sensitive admin action: the button first expands into an explanation of what will happen
// (and a reason field when one is required); nothing changes until "Confirm" is pressed.
export function ConfirmAction({
  label,
  consequence,
  action,
  fields,
  reasonLabel,
  confirmLabel = "Confirm",
  tone = "default",
}: {
  label: string;
  consequence: React.ReactNode;
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  reasonLabel?: string; // when set, a reason is required
  confirmLabel?: string;
  tone?: "default" | "danger";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});
  const id = useId();

  if (!open) {
    return (
      <div className="flex flex-col gap-1">
        <Button variant={tone === "danger" ? "secondary" : "secondary"} onClick={() => setOpen(true)} className={tone === "danger" ? "border-danger/60 text-danger hover:bg-danger hover:text-white" : ""}>
          {label}
        </Button>
        {state.message && (
          <p role="status" className={`text-sm ${state.ok ? "text-accent" : "text-danger"}`}>
            {state.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      action={async (form) => {
        await formAction(form);
        setOpen(false);
      }}
      className="flex flex-col gap-3 rounded-2xl border border-line-strong bg-surface p-4"
      aria-labelledby={`${id}-title`}
    >
      <p id={`${id}-title`} className="font-medium">
        {label}
      </p>
      <div className="text-sm text-muted">{consequence}</div>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {reasonLabel && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{reasonLabel}</span>
          <textarea name="reason" required maxLength={500} rows={2} className="rounded-xl border border-line bg-surface px-3 py-2" />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} className={tone === "danger" ? "!bg-danger hover:!bg-danger/90" : ""}>
          {pending ? "Working…" : confirmLabel}
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)} className="px-3">
          Keep as is
        </Button>
      </div>
    </form>
  );
}
