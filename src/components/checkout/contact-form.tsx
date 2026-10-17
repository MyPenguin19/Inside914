"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect } from "react";
import type { ContactFormState } from "@/app/(public)/actions/checkout";
import { BUSINESS_CATEGORIES, type ContactField } from "@/lib/checkout/contact";
import { checkoutMessage } from "@/lib/checkout/messages";

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
        <p role="alert" className="rounded-lg bg-[#fbeceb] px-4 py-3 text-sm text-danger">
          {checkoutMessage(state.message)}{" "}
          {state.message !== "error" && (
            <Link href="/#editions" className="font-medium underline">
              Choose a position
            </Link>
          )}
        </p>
      )}
      <Field name="businessName" label="Business name" autoComplete="organization" values={values} errors={errors} required />
      <Field name="contactName" label="Your name" autoComplete="name" values={values} errors={errors} required />
      <Field name="email" label="Email" type="email" autoComplete="email" inputMode="email" values={values} errors={errors} required
        hint="We'll send your confirmation and private reservation link here." />
      <Field name="phone" label="Phone" type="tel" autoComplete="tel" inputMode="tel" values={values} errors={errors} required />
      <Field name="website" label="Website" autoComplete="url" inputMode="url" values={values} errors={errors} hint="Optional" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="category" className="text-sm font-medium">
          Type of business <span className="font-normal text-muted">(optional)</span>
        </label>
        <select
          id="category"
          name="category"
          defaultValue={values.category}
          aria-invalid={!!errors.category}
          aria-describedby={errors.category ? "category-error" : undefined}
          className="rounded-lg border border-line bg-surface px-3 py-3 text-base"
        >
          <option value="">Choose one</option>
          {BUSINESS_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {errors.category && <p id="category-error" className="text-sm text-danger">{errors.category}</p>}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-foreground px-6 py-3 text-base font-medium text-background hover:bg-accent disabled:cursor-wait disabled:bg-line disabled:text-muted"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function Field(props: {
  name: ContactField;
  label: string;
  values: Record<string, string>;
  errors: Partial<Record<ContactField, string>>;
  type?: string;
  autoComplete?: string;
  inputMode?: "email" | "tel" | "url";
  required?: boolean;
  hint?: string;
}) {
  const error = props.errors[props.name];
  const describedBy = [error && `${props.name}-error`, props.hint && `${props.name}-hint`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={props.name} className="text-sm font-medium">
        {props.label}
        {props.required && <span className="text-muted"> *</span>}
      </label>
      <input
        id={props.name}
        name={props.name}
        type={props.type ?? "text"}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        defaultValue={props.values[props.name]}
        required={props.required}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={`rounded-lg border bg-surface px-3 py-3 text-base ${error ? "border-danger" : "border-line"}`}
      />
      {props.hint && !error && <p id={`${props.name}-hint`} className="text-xs text-muted">{props.hint}</p>}
      {error && (
        <p id={`${props.name}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
