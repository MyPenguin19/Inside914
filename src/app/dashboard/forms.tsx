"use client";
import { useActionState } from "react";
import { saveDetails, cancelReservation } from "./actions";
import { TextField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/primitives";
export function DetailsForm({
  id,
  contact,
}: {
  id: string;
  contact: {
    business_name: string;
    contact_name: string;
    phone: string;
    website: string | null;
    category: string | null;
  };
}) {
  const [state, action, pending] = useActionState(
    saveDetails.bind(null, id),
    {},
  );
  return (
    <form action={action} className="space-y-4">
      {state.message && <Notice role="status">{state.message}</Notice>}
      <TextField
        id="businessName"
        label="Business name"
        required
        defaultValue={contact.business_name}
      />
      <TextField
        id="contactName"
        label="Contact name"
        required
        defaultValue={contact.contact_name}
      />
      <TextField
        id="phone"
        label="Phone"
        type="tel"
        required
        defaultValue={contact.phone}
      />
      <TextField
        id="website"
        label="Website"
        defaultValue={contact.website ?? ""}
      />
      <input type="hidden" name="category" value={contact.category ?? ""} />
      <Button disabled={pending} type="submit">
        Save details
      </Button>
    </form>
  );
}
export function CancelForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(
    cancelReservation.bind(null, id),
    {},
  );
  return (
    <form action={action} className="space-y-3">
      {state.message && <Notice role="status">{state.message}</Notice>}
      <label className="flex items-start gap-3">
        <input type="checkbox" name="confirm" required className="mt-1" />
        <span>
          Cancel this area and release its spaces. Other area reservations will
          remain active.
        </span>
      </label>
      <Button variant="secondary" type="submit" disabled={pending}>
        Cancel this reservation
      </Button>
    </form>
  );
}
