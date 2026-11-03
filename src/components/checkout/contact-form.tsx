"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef } from "react";
import type { ContactFormState } from "@/app/(public)/actions/checkout";
import { BUSINESS_CATEGORIES, type ContactField } from "@/lib/checkout/contact";
import { checkoutMessage } from "@/lib/checkout/messages";
import { buttonClass } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/primitives";

type Props = {
  action: (state: ContactFormState, form: FormData) => Promise<ContactFormState>;
  initial: Record<ContactField, string>;
  lockedCategory?: string;
  hideCategory?: boolean;
  onDone?: () => void; // for actions that finish without a server redirect (design preview)
  submitLabel?: string;
};

export function ContactForm({ action, initial, onDone, lockedCategory, hideCategory, submitLabel = "Continue to save card" }: Props) {
  const [state, formAction, pending] = useActionState(action, { values: initial });
  useEffect(() => {
    if (state.done) onDone?.();
  }, [state.done, onDone]);
  const formRef=useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.errors) formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [state.errors]);
  useEffect(()=>{
    // Only public business name/website are retained locally; no personal contact or card data.
    try { const saved=JSON.parse(sessionStorage.getItem("inside914-business-draft")??"{}");
      for(const name of ["businessName","website"]) { const field=formRef.current?.elements.namedItem(name);if(field instanceof HTMLInputElement&&!field.value&&typeof saved[name]==="string")field.value=saved[name]; }
    } catch { /* Storage may be unavailable. */ }
  },[]);
  const values = initial; // uncontrolled fields keep what the customer typed
  const errors = state.errors ?? {};

  // Submit via onSubmit (not <form action>) so React doesn't auto-reset the fields afterwards,
  // which could wipe a correction typed while the response was arriving.
  return (
    <form
      ref={formRef}
      onChange={()=>{try{const form=formRef.current;if(!form)return;const data=new FormData(form);sessionStorage.setItem("inside914-business-draft",JSON.stringify({businessName:data.get("businessName"),website:data.get("website")}));}catch{/* Optional convenience only. */}}}
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
            <Link href="/areas" className="font-medium underline">
              Choose a position
            </Link>
          )}
        </Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <ContactFields values={values} errors={errors} lockedCategory={lockedCategory} hideCategory={hideCategory} />
      </div>
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "mt-2 disabled:cursor-wait")}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

// The business/contact fields on their own, so other forms (the design preview) can reuse them.
// Render inside a grid: two per row on wider screens, in reading order.
export function ContactFields({ values, errors, lockedCategory, hideCategory }: { hideCategory?: boolean; lockedCategory?: string; values: Record<string, string>; errors: Partial<Record<ContactField, string>> }) {
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
        hint="Your confirmation and reservation link go here. No account needed."
      />
      <TextField {...field("phone")} label="Phone" type="tel" autoComplete="tel" inputMode="tel" required />
      <TextField {...field("website")} label="Website" autoComplete="url" inputMode="url" optional />
      {!hideCategory && (lockedCategory ? <TextField id="category-display" label="Business category" value={lockedCategory} readOnly /> : <SelectField {...field("category")} label="Type of business" optional>
        <option value="">Choose one</option>
        {BUSINESS_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </SelectField>)}
    </>
  );
}
