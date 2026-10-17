"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect } from "react";
import type { ContactFormState } from "@/app/(public)/actions/checkout";
import { BUSINESS_CATEGORIES, type ContactField } from "@/lib/checkout/contact";
import { checkoutMessage } from "@/lib/checkout/messages";
import { buttonClass } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";

type Props = {
  action: (state: ContactFormState, form: FormData) => Promise<ContactFormState>;
  initial: Record<ContactField, string>;
  onDone?: () => void; // for actions that finish without a server redirect (design preview)
  submitLabel?: string;
};

export function ContactForm({ action, initial, onDone, submitLabel = "Continue to payment details" }: Props) {
  const [state, formAction, pending] = useActionState(action, { values: initial });
  useEffect(() => {
    if (state.done) onDone?.();
  }, [state.done, onDone]);
  const values = initial; // uncontrolled fields keep what the customer typed
  const errors = state.errors ?? {};

  // Submit via onSubmit (not <form action>) so React doesn't auto-reset the fields afterwards,
  // which could wipe a correction typed while the response was arriving.
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {state.message && (
        <Notice tone="danger" role="alert">
          {checkoutMessage(state.message)}{" "}
          {state.message !== "error" && (
            <Link href="/#editions" className="font-medium underline">
              Choose a position
            </Link>
          )}
        </Notice>
      )}
      <ContactFields values={values} errors={errors} />
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "mt-2 disabled:cursor-wait")}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

// The business/contact fields on their own, so other forms (the design preview) can reuse them.
export function ContactFields({ values, errors }: { values: Record<string, string>; errors: Partial<Record<ContactField, string>> }) {
  const field = (name: ContactField) => ({ id: name, defaultValue: values[name], error: errors[name] });
  return (
    <>
      <TextField {...field("businessName")} label="Business name" autoComplete="organization" required />
      <TextField {...field("contactName")} label="Your name" autoComplete="name" required />
      <TextField
        {...field("email")}
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        hint="We'll send your confirmation and private reservation link here."
      />
      <TextField {...field("phone")} label="Phone" type="tel" autoComplete="tel" inputMode="tel" required />
      <TextField {...field("website")} label="Website" autoComplete="url" inputMode="url" optional />
      <SelectField {...field("category")} label="Type of business" optional>
        <option value="">Choose one</option>
        {BUSINESS_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </SelectField>
    </>
  );
}
