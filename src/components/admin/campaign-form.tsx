"use client";
import { findPostcardLayout } from "@/lib/print/layouts";

import { useActionState } from "react";
import type { ActionResult } from "@/app/admin/admin-actions";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";
import type { LayoutTemplate } from "@/lib/admin/layouts";

export type CampaignFormDefaults = Record<string, string>;

// Create and edit share this form. `locked` = customers have booked: only the name and target
// quantity can change (the database enforces the same rule).
export function CampaignForm({
  action,
  zones,
  templates,
  defaults,
  mode,
  locked = false,
  id,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  zones: { id: string; name: string }[];
  templates: Pick<LayoutTemplate, "key" | "label" | "description">[];
  defaults: CampaignFormDefaults;
  mode: "create" | "edit";
  locked?: boolean;
  id?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const v = (k: string) => state.values?.[k] ?? defaults[k] ?? "";
  const e = state.errors ?? {};
  const square = !!findPostcardLayout(defaults.layout_template);
  const fixed = mode === "edit"; // area, layout and prices can't change after creation

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      {id && <input type="hidden" name="id" value={id} />}
      {locked && <input type="hidden" name="locked" value="true" />}
      {state.message && (
        <Notice tone="danger" role="alert">
          {state.message}
        </Notice>
      )}
      {locked && (
        <Notice tone="info" role="note">
          Customers have already booked this campaign, so only the name and target quantity can change. Moving dates or
          the mailing month needs a separate workflow with customer consent.
        </Notice>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold">Campaign</legend>
        <TextField id="name" label="Campaign name" required defaultValue={v("name")} error={e.name} maxLength={120} />
        <SelectField id="zone_id" label="Area" required defaultValue={v("zone_id")} error={e.zone_id} disabled={fixed}>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </SelectField>
        {fixed && <input type="hidden" name="zone_id" value={v("zone_id")} />}
        <TextField id="issue_month" label="Mailing month" type="month" required defaultValue={v("issue_month")} error={e.issue_month} disabled={locked} />
        <TextField id="target_quantity" label="Target mailing quantity (homes)" hint="Provisional estimate; not a confirmed delivery quantity." type="number" inputMode="numeric" min={1} required defaultValue={v("target_quantity")} error={e.target_quantity} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={locked}>
        <legend className="mb-1 text-lg font-semibold">Dates</legend>
        <p className="text-sm text-muted sm:col-span-2">Times are Westchester time. Order: reservations open → reservation deadline → artwork due → mailing window.</p>
        <TextField id="reservations_open_at" label="Reservations open" type="datetime-local" optional defaultValue={v("reservations_open_at")} error={e.reservations_open_at} hint="Leave empty to allow bookings as soon as it's opened." />
        <TextField id="reservation_deadline" label="Reservation deadline" type="datetime-local" required defaultValue={v("reservation_deadline")} error={e.reservation_deadline} />
        <TextField id="artwork_due_at" label="Artwork submission deadline" type="datetime-local" required defaultValue={v("artwork_due_at")} error={e.artwork_due_at} />
        <div className="hidden sm:block" />
        <TextField id="mailing_window_start" label="Mailing window: first day" type="date" required defaultValue={v("mailing_window_start")} error={e.mailing_window_start} />
        <TextField id="mailing_window_end" label="Mailing window: last day" type="date" required defaultValue={v("mailing_window_end")} error={e.mailing_window_end} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={fixed}>
        <legend className="mb-1 text-lg font-semibold">Layout and prices</legend>
        {fixed && <p className="text-sm text-muted sm:col-span-2">Set when the campaign was created. Each reservation keeps the price it was booked at.</p>}
        <SelectField id="layout_template" label="Postcard layout" required defaultValue={v("layout_template")} error={e.layout_template} hint={templates.find((t) => t.key === v("layout_template"))?.description}>
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </SelectField>
        <div className="hidden sm:block" />
        <TextField id="unit_price_cents" label={square ? "Ad per area ($)" : "Standard price ($)"} readOnly={square} inputMode="decimal" required defaultValue={v("unit_price_cents")} error={e.unit_price_cents} />
        {square ? <input type="hidden" name="double_price_cents" value="" /> : <TextField id="double_price_cents" label="Double price ($)" inputMode="decimal" optional defaultValue={v("double_price_cents")} error={e.double_price_cents} hint="Leave empty if this campaign has no double-size ads." />}
      </fieldset>
      {/* Outside the disabled fieldset: disabled fields aren't submitted. */}
      {fixed && (
        <>
          <input type="hidden" name="layout_template" value={v("layout_template")} />
          <input type="hidden" name="unit_price_cents" value={v("unit_price_cents")} />
          <input type="hidden" name="double_price_cents" value={v("double_price_cents")} />
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create draft campaign" : "Save changes"}
        </Button>
        {mode === "create" && <p className="text-sm text-muted">New campaigns start as drafts. Nothing is published until you open it.</p>}
      </div>
    </form>
  );
}
