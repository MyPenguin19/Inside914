"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ContactFields } from "@/components/checkout/contact-form";
import { ReservationSummary } from "@/components/checkout/reservation-summary";
import { demoReservationView } from "@/components/demo/demo-ad-view";
import { useDemoStore, type DemoContact } from "@/components/demo/demo-store";
import { DemoSteps } from "@/components/demo/demo-steps";
import { NeedSelection } from "@/components/demo/need-selection";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/primitives";
import { parseContact, type ContactErrors, type ContactField } from "@/lib/checkout/contact";
import { consentText } from "@/lib/checkout/terms";
import { DEMO_ZONES } from "@/lib/demo/data";
import { formatDeadline, formatPrice } from "@/lib/format";

const FIELDS: ContactField[] = ["businessName", "contactName", "email", "phone", "website", "category"];
const LABELS: Record<ContactField, string> = {
  businessName: "Business name",
  contactName: "Your name",
  email: "Email",
  phone: "Phone",
  website: "Website",
  category: "Type of business",
};

// REVIEW & RESERVE, design preview: details, the future-payment explanation, a card placeholder
// (NO card inputs: nothing can be typed or sent) and the agreement, on one page. Real validation
// rules; what's typed stays in this browser tab.
export default function DemoCheckoutPage() {
  const router = useRouter();
  const { selection, artwork, contact, setContact, hydrated } = useDemoStore();
  const [errors, setErrors] = useState<ContactErrors>({});
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  if (!hydrated) return <div className="h-96 animate-pulse rounded-2xl bg-background-soft" />;
  if (!selection) return <NeedSelection />;
  const view = demoReservationView(selection, artwork, contact);

  function read(form: HTMLFormElement): DemoContact {
    const data = new FormData(form);
    const v = (k: ContactField) => String(data.get(k) ?? "");
    return { businessName: v("businessName"), contactName: v("contactName"), email: v("email"), phone: v("phone"), website: v("website"), category: v("category") };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = read(event.currentTarget);
    const parsed = parseContact(values);
    const nextErrors = parsed.ok ? {} : parsed.errors;
    setErrors(nextErrors);
    setConsentError(!consent);
    if (!parsed.ok || !consent) {
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setContact(values);
    router.push("/demo/confirmed");
  }

  const problems = [
    ...FIELDS.filter((f) => errors[f]).map((f) => ({ href: `#${f}`, text: `${LABELS[f]}: ${errors[f]}` })),
    ...(consentError && !consent ? [{ href: "#consent", text: "Please check the box to agree to the future payment." }] : []),
  ];

  return (
    <div>
      <DemoSteps current={4} />
      <div className="mt-5">
        <Link href="/demo/artwork" className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
          ← Back to artwork
        </Link>
      </div>
      <header className="mt-3">
        <h1 className="font-display text-4xl font-medium tracking-tight">Review and reserve</h1>
        <p className="mt-2 text-muted">
          Check your ad, add your details, and save a card. <strong className="text-foreground">You pay $0 today.</strong>
        </p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:gap-8">
        <aside className="lg:order-last">
          <div className="lg:sticky lg:top-20">
            <ReservationSummary view={view} amountLabel="Amount you'll authorize" zones={DEMO_ZONES} />
            <Link href="/demo/postcard" className="mt-3 inline-block text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
              Change space
            </Link>
          </div>
        </aside>

        <form noValidate onSubmit={submit} onChange={(e) => setContact(read(e.currentTarget))} className="flex min-w-0 flex-col gap-7">
          {problems.length > 0 && (
            <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
              <p className="font-medium">Please fix {problems.length === 1 ? "this" : `these ${problems.length} things`} to continue:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {problems.map((p) => (
                  <li key={p.href}>
                    <a href={p.href} className="underline">
                      {p.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Section n={1} title="Your business">
            <div className="grid gap-4 sm:grid-cols-2">
              <ContactFields
                values={{
                  businessName: contact?.businessName ?? "",
                  contactName: contact?.contactName ?? "",
                  email: contact?.email ?? "",
                  phone: contact?.phone ?? "",
                  website: contact?.website ?? "",
                  category: contact?.category ?? "",
                }}
                errors={errors}
              />
            </div>
          </Section>

          <Section n={2} title="How payment works">
            <ol className="grid gap-3 text-sm sm:grid-cols-3">
              {[
                ["Today", "You save a card. $0 is charged."],
                ["When the postcard fills", `and we approve it for print, we charge ${formatPrice(selection.priceCents)} and email you.`],
                ["If it doesn't fill", `by ${formatDeadline(view.artworkDeadline)}, your reservation is canceled. You're never charged.`],
              ].map(([when, what]) => (
                <li key={when} className="rounded-xl border border-line bg-surface p-3.5">
                  <p className="font-medium">{when}</p>
                  <p className="mt-1 text-muted">{what}</p>
                </li>
              ))}
            </ol>
          </Section>

          <Section n={3} title="Card for the future payment">
            <div aria-label="Card form placeholder (design preview)" role="img" className="rounded-xl border border-dashed border-line-strong bg-surface p-4">
              <div className="grid gap-3">
                <div className="h-12 rounded-xl border border-line bg-background-soft" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-12 rounded-xl border border-line bg-background-soft" />
                  <div className="h-12 rounded-xl border border-line bg-background-soft" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">
                Design preview: Stripe&apos;s secure card form will appear here. No card details can be entered in this
                preview.
              </p>
            </div>
          </Section>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="consent"
              className={`flex cursor-pointer gap-3 rounded-xl border bg-surface p-4 text-sm leading-6 ${consentError && !consent ? "border-danger" : "border-line"}`}
            >
              <input
                id="consent"
                type="checkbox"
                checked={consent}
                aria-invalid={consentError && !consent}
                aria-describedby="consent-links"
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
              />
              <span>{consentText(selection.priceCents)}</span>
            </label>
            <p id="consent-links" className="text-xs text-muted">
              Please read our <Link href="/legal/terms" className="underline">Advertising terms</Link>,{" "}
              <Link href="/legal/reservation-policy" className="underline">Reservation policy</Link> and{" "}
              <Link href="/legal/privacy" className="underline">Privacy policy</Link>.
            </p>
          </div>

          <div className="grid gap-3">
            <Button type="submit" size="lg" className="w-full sm:w-auto sm:justify-self-start">
              Reserve my space · $0 today
            </Button>
            <Notice tone="warning" role="note">
              Design preview: this button doesn&apos;t save a card or create a reservation.
            </Notice>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`section-${n}`}>
      <h2 id={`section-${n}`} className="mb-3 flex items-center gap-2.5 text-lg font-semibold">
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-sm text-background">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}
