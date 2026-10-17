"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BookingSteps } from "@/components/booking/booking-steps";
import { ReservationSummary } from "@/components/checkout/reservation-summary";
import { demoReservationView } from "@/components/demo/demo-ad-view";
import { useDemoStore } from "@/components/demo/demo-store";
import { NeedSelection } from "@/components/demo/need-selection";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/primitives";
import { consentText } from "@/lib/checkout/terms";

// Visual prototype of the reserve step. There are NO card inputs here: the gray boxes only show
// where Stripe's secure card form will appear. Nothing is collected or sent.
export default function DemoPaymentPage() {
  const router = useRouter();
  const { selection, artwork, contact } = useDemoStore();
  const [consent, setConsent] = useState(false);

  if (!selection) return <NeedSelection />;
  const view = demoReservationView(selection, artwork, contact);

  return (
    <div>
      <BookingSteps current={5} />
      <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <section aria-labelledby="pay-title">
          <h1 id="pay-title" className="font-display text-4xl font-medium tracking-tight">
            Reserve your space
          </h1>
          <p className="mt-2 text-muted">
            Save a card to hold your space. <strong className="text-foreground">Nothing is charged today.</strong>
          </p>
          <ol className="mt-6 grid gap-3">
            {[
              ["Today", "Your card is saved securely with Stripe. $0 charged."],
              ["When every space is reserved", "and we approve the campaign for print, we charge the amount shown and email you."],
              ["If the campaign doesn't fill", "by its deadline, your reservation is canceled and you're never charged."],
            ].map(([when, what]) => (
              <li key={when} className="flex gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
                <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                <span>
                  <strong>{when}:</strong> <span className="text-muted">{what}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium">Card details</p>
            <div aria-label="Card form placeholder (design preview)" role="img" className="rounded-xl border border-dashed border-line bg-surface p-4">
              <div className="grid gap-3">
                <div className="h-11 rounded-lg bg-background-soft" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-11 rounded-lg bg-background-soft" />
                  <div className="h-11 rounded-lg bg-background-soft" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">
                Design preview: Stripe&apos;s secure card form appears here. No card details can be entered in this preview.
              </p>
            </div>
          </div>

          <label className="mt-6 flex gap-3 rounded-xl border border-line bg-surface p-4 text-sm leading-6">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
            />
            <span>{consentText(selection.priceCents)}</span>
          </label>
          <p className="mt-2 text-xs text-muted">
            Please read our <Link href="/legal/terms" className="underline">Advertising terms</Link>,{" "}
            <Link href="/legal/reservation-policy" className="underline">Reservation policy</Link> and{" "}
            <Link href="/legal/privacy" className="underline">Privacy policy</Link>.
          </p>

          <div className="mt-6 grid gap-3">
            <Button size="lg" disabled={!consent} onClick={() => router.push("/demo/confirmed")}>
              Reserve my space
            </Button>
            <Notice tone="warning" role="note">
              Design preview: this button doesn&apos;t save a card or create a reservation.
            </Notice>
          </div>
        </section>
        <aside>
          <ReservationSummary view={view} />
        </aside>
      </div>
    </div>
  );
}
