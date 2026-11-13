"use client";
import { findPostcardLayout } from "@/lib/print/layouts";

import { useActionState, useId } from "react";
import type { ActionResult } from "@/app/admin/admin-actions";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";
import type { LayoutTemplate } from "@/lib/admin/layouts";

export type CampaignFormDefaults = Record<string, string>;

// Create and edit share this form. `locked` = customers have booked: only the name, target quantity and price for new holds can change (the database enforces the same rule).
export function CampaignForm({
  action,
  zones,
  templates,
  defaults,
  mode,
  locked = false,
  areaEditable = false,
  id,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  zones: { id: string; name: string }[];
  templates: Pick<LayoutTemplate, "key" | "label" | "description">[];
  defaults: CampaignFormDefaults;
  mode: "create" | "edit";
  locked?: boolean;
  areaEditable?: boolean;
  id?: string;
}) {
  const fieldPrefix = useId();
  const fieldId = (name: string) => `${fieldPrefix}-${name}`;
  const [state, formAction, pending] = useActionState(action, {});
  const v = (k: string) => state.values?.[k] ?? defaults[k] ?? "";
  const e = state.errors ?? {};
  const square = !!findPostcardLayout(defaults.layout_template);
  const fixed = mode === "edit"; // Layout changes use the separate upgrade workflow.
  const areaFixed = fixed && !areaEditable;

  return (
    // Successful saves redirect. Keep the user's entries when an action returns
    // validation errors instead of letting React's native form reset discard them.
    <form action={formAction} onReset={(event) => event.preventDefault()} noValidate className="flex flex-col gap-6">
      {id && <input type="hidden" name="id" value={id} />}
      {locked && <input type="hidden" name="locked" value="true" />}
      {state.message && (
        <Notice tone="danger" role="alert">
          {state.message}
        </Notice>
      )}
      {locked && (
        <Notice tone="info" role="note">
          Customers have already booked this campaign, so only the name, target quantity and price for new reservations can change. Existing holds and reservations keep their agreed price. Moving dates or
          the mailing month needs a separate workflow with customer consent.
        </Notice>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold">{mode === "create" ? "1. Choose the area" : "Campaign details"}</legend>
        <TextField id={fieldId("name")} name="name" label="Campaign name" required defaultValue={v("name")} error={e.name} maxLength={120} hint="A name you will recognize, such as Northern Westchester — January 2027." />
        <SelectField id={fieldId("zone_id")} name="zone_id" label="Area" required defaultValue={v("zone_id")} error={e.zone_id} disabled={areaFixed} hint={areaFixed ? "The area can only change on an unused draft without reservation or production history." : undefined}>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </SelectField>
        {areaFixed && <input type="hidden" name="zone_id" value={v("zone_id")} />}
        <TextField id={fieldId("issue_month")} name="issue_month" label="Mailing month" type="month" required defaultValue={v("issue_month")} error={e.issue_month} disabled={locked} />
        <TextField id={fieldId("target_quantity")} name="target_quantity" label="Target mailing quantity (homes)" hint="How many homes you plan to reach. This is an estimate." type="number" inputMode="numeric" min={1} required defaultValue={v("target_quantity")} error={e.target_quantity} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={locked}>
        <legend className="mb-1 text-lg font-semibold">{mode === "create" ? "2. Set the schedule" : "Schedule"}</legend>
        <p className="text-sm text-muted sm:col-span-2">Set the last day to reserve, when ads are due, and when you plan to mail. All times are Westchester time.</p>
        <TextField id={fieldId("reservations_open_at")} name="reservations_open_at" label="Reservations open" type="datetime-local" optional defaultValue={v("reservations_open_at")} error={e.reservations_open_at} hint="Leave empty to allow bookings as soon as it's opened." />
        <TextField id={fieldId("reservation_deadline")} name="reservation_deadline" label="Reservation deadline" type="datetime-local" required defaultValue={v("reservation_deadline")} error={e.reservation_deadline} />
        <TextField id={fieldId("artwork_due_at")} name="artwork_due_at" label="Artwork submission deadline" type="datetime-local" required defaultValue={v("artwork_due_at")} error={e.artwork_due_at} />
        <div className="hidden sm:block" />
        <TextField id={fieldId("mailing_window_start")} name="mailing_window_start" label="Mailing window: first day" type="date" required defaultValue={v("mailing_window_start")} error={e.mailing_window_start} />
        <TextField id={fieldId("mailing_window_end")} name="mailing_window_end" label="Mailing window: last day" type="date" required defaultValue={v("mailing_window_end")} error={e.mailing_window_end} />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1 text-lg font-semibold">{mode === "create" ? "3. Set the price" : "Price and layout"}</legend>
        {fixed && <p className="text-sm text-muted sm:col-span-2">The layout stays with the campaign. Price changes apply only to new reservations.</p>}
        <SelectField id={fieldId("layout_template")} name="layout_template" label="Postcard layout" disabled={fixed} required defaultValue={v("layout_template")} error={e.layout_template} hint={templates.find((t) => t.key === v("layout_template"))?.description}>
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </SelectField>
        <div className="hidden sm:block" />
        <TextField id={fieldId("unit_price_cents")} name="unit_price_cents" label="Price per advertising position ($)" inputMode="decimal" required defaultValue={v("unit_price_cents")} error={e.unit_price_cents} />
        {square ? <input type="hidden" name="double_price_cents" value="" /> : <TextField id={fieldId("double_price_cents")} name="double_price_cents" label="Double price ($)" readOnly={fixed} inputMode="decimal" optional defaultValue={v("double_price_cents")} error={e.double_price_cents} hint="Leave empty if this campaign has no double-size ads." />}
      </fieldset>
      {fixed && <input type="hidden" name="layout_template" value={v("layout_template")} />}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : mode === "create" ? "Create draft campaign" : "Save changes"}
        </Button>
        {mode === "create" && <p className="text-sm text-muted">New campaigns start as drafts. Nothing is published until you open it.</p>}
      </div>
    </form>
  );
}
