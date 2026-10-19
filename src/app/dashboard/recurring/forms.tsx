"use client";
import { useActionState } from "react";
import { createPlan, changePlan, prepareOccurrence } from "./actions";
import { TextField, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/primitives";
export function PlanForm({
  sources,
}: {
  sources: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(createPlan, {});
  return (
    <form action={action} className="max-w-xl space-y-4">
      {state.message && <Notice role="status">{state.message}</Notice>}
      <TextField id="name" label="Plan name" required maxLength={100} />
      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">
          Reservations to repeat (one per area, up to four)
        </legend>
        {sources.map((s) => (
          <label key={s.id} className="flex items-start gap-3">
            <input
              type="checkbox"
              name="sources"
              value={s.id}
              className="mt-1"
            />
            <span>{s.label}</span>
          </label>
        ))}
      </fieldset>
      <SelectField id="interval" label="Repeat" defaultValue="1">
        <option value="1">Monthly</option>
        <option value="3">Quarterly</option>
      </SelectField>
      <TextField
        id="startMonth"
        label="First repeat month"
        type="month"
        required
      />
      <TextField
        id="endMonth"
        label="Last repeat month"
        type="month"
        required
        hint="Choose up to two years. Each occurrence needs your review and confirmation."
      />
      <Button type="submit" disabled={pending || !sources.length}>
        Save recurring plan
      </Button>
    </form>
  );
}
export function PlanControls({ id, status }: { id: string; status: string }) {
  const [state, action, pending] = useActionState(
    changePlan.bind(null, id),
    {},
  );
  return (
    <form action={action} className="space-y-3">
      {state.message && <Notice role="status">{state.message}</Notice>}
      {status !== "cancelled" && (
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            name="status"
            value={status === "paused" ? "active" : "paused"}
            disabled={pending}
            variant="secondary"
          >
            {status === "paused" ? "Resume plan" : "Pause plan"}
          </Button>
          <Button
            type="submit"
            name="status"
            value="cancelled"
            disabled={pending}
            variant="secondary"
          >
            Cancel recurring plan
          </Button>
        </div>
      )}
    </form>
  );
}
export function OccurrenceForm({
  id,
  month,
  total,
}: {
  id: string;
  month: string;
  total: number;
}) {
  const [state, action, pending] = useActionState(
    prepareOccurrence.bind(null, id, month),
    {},
  );
  return (
    <form action={action} className="space-y-3">
      {state.message && <Notice role="status">{state.message}</Notice>}
      <input type="hidden" name="total" value={total} />
      <label className="flex items-start gap-3">
        <input type="checkbox" name="confirm" required className="mt-1" />
        <span>
          I reviewed the current areas, positions and prices. Continue to
          artwork and checkout for this occurrence.
        </span>
      </label>
      <Button type="submit" disabled={pending}>
        Continue to artwork and checkout
      </Button>
    </form>
  );
}
