"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { submitContactMessage } from "@/app/contact/actions";
import { type ContactMessageState, CONTACT_UNAVAILABLE } from "@/lib/contact/schema";
import { TextField, controlClass } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/primitives";

export function ContactMessageForm() {
  const submissionId = useRef<string | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const [state, action, pending] = useActionState(async (previous: ContactMessageState, form: FormData): Promise<ContactMessageState> => {
    try { return await submitContactMessage(previous, form); }
    catch { return { ok: false, message: CONTACT_UNAVAILABLE }; }
  }, {});
  const errors = state.errors ?? {};
  useEffect(() => {
    if (state.message) feedback.current?.focus();
  }, [state]);

  if (state.ok) return <div ref={feedback} tabIndex={-1}><Notice tone="success" role="status">{state.message}</Notice></div>;

  return <form className="flex flex-col gap-5" noValidate onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    submissionId.current ??= crypto.randomUUID();
    const form = new FormData(event.currentTarget);
    form.set("submissionId", submissionId.current);
    startTransition(() => action(form));
  }}>
    <p className="text-sm text-muted">Fields marked with * are required.</p>
    {state.message && <div ref={feedback} tabIndex={-1}>
      <Notice tone="danger" role="alert">
        <p className="font-medium">{state.message}</p>
        {Object.keys(errors).length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">
          {Object.entries(errors).map(([field, error]) => <li key={field}><a href={`#${field}`} className="underline underline-offset-4">{error}</a></li>)}
        </ul>}
      </Notice>
    </div>}
    <TextField id="name" label="Your name" autoComplete="name" required maxLength={100} error={errors.name} />
    <TextField id="email" label="Email" autoComplete="email" type="email" required maxLength={254} error={errors.email} />
    <TextField id="phone" label="Phone" autoComplete="tel" type="tel" optional maxLength={40} error={errors.phone} />
    <div className="flex flex-col gap-1.5">
      <label htmlFor="message" className="text-sm font-medium">Message <span aria-hidden="true" className="text-muted">*</span></label>
      <textarea id="message" name="message" required rows={5} maxLength={5000} className={controlClass(!!errors.message)} aria-invalid={!!errors.message} aria-describedby={errors.message ? "message-error" : undefined} />
      {errors.message && <p id="message-error" className="text-sm text-danger">{errors.message}</p>}
    </div>
    <div className="hidden" aria-hidden="true">
      <label htmlFor="website">Leave this field empty</label>
      <input id="website" name="website" tabIndex={-1} autoComplete="off" maxLength={200} />
    </div>
    <p className="text-sm text-muted">We’ll use your details to respond to your message. <Link href="/legal/privacy" className="underline">Privacy policy</Link></p>
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass("primary", "lg")}>{pending ? "Sending…" : "Send message"}</button>
  </form>;
}
