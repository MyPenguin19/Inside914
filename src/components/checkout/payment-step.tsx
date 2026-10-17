"use client";

import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BeginPaymentResult } from "@/app/(public)/actions/checkout";
import { checkoutMessage, START_OVER } from "@/lib/checkout/messages";

type Actions = {
  beginPayment: () => Promise<BeginPaymentResult>;
  simulateCardSetup?: () => Promise<{ ok: boolean; reason?: string }>; // development TEST mode only
  giveConsent: (input: { accepted: boolean; termsVersion: string }) => Promise<{ ok: boolean; reason?: string }>;
  confirmReservation: () => Promise<{ outcome: string }>;
};

type Props = {
  publishableKey: string | null;
  consentText: string;
  termsVersion: string;
  actions: Actions;
  testMode?: boolean; // development-only simulated card (decided on the server)
  loadStripeJs?: typeof loadStripe; // injectable for tests
};

type Phase = "loading" | "ready" | "saved" | "submitting" | "processing" | "unavailable";

// Saves a card with Stripe's own secure form (card details never touch our servers) after an
// explicit, unticked-by-default consent. Then asks the server to confirm the reservation.
export function PaymentStep({ publishableKey, consentText, termsVersion, actions, testMode = false, loadStripeJs = loadStripe }: Props) {
  const router = useRouter();
  const mountRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const stripeRef = useRef<{ stripe: Stripe; elements: StripeElements } | null>(null);
  const inFlight = useRef(false); // blocks a second submit even within the same frame
  const [phase, setPhase] = useState<Phase>(publishableKey || testMode ? "loading" : "unavailable");
  const [cardComplete, setCardComplete] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<{ text: string; startOver: boolean } | null>(null);

  const fail = (reason: string) => setError({ text: checkoutMessage(reason), startOver: START_OVER.has(reason) });

  useEffect(() => {
    if ((!publishableKey && !testMode) || started.current) return;
    started.current = true;
    (async () => {
      const result = await actions.beginPayment();
      if (!result.ok) {
        setPhase("unavailable");
        return fail(result.reason);
      }
      if (result.status === "succeeded") return setPhase("saved"); // card already saved earlier
      if (testMode) {
        setCardComplete(true); // the simulated card needs no input
        return setPhase("ready");
      }
      const stripe = await loadStripeJs(publishableKey!);
      if (!stripe || !mountRef.current) {
        setPhase("unavailable");
        return fail("payment_not_started");
      }
      const elements = stripe.elements({
        clientSecret: result.clientSecret,
        appearance: { theme: "stripe", variables: { colorPrimary: "#1f5c4a", borderRadius: "10px", fontSizeBase: "16px" } },
      });
      const card = elements.create("payment", { layout: "tabs" });
      card.on("change", (e) => setCardComplete(e.complete));
      card.mount(mountRef.current);
      stripeRef.current = { stripe, elements };
      setPhase("ready");
    })().catch(() => {
      setPhase("unavailable");
      fail("error");
    });
  }, [publishableKey, testMode, actions, loadStripeJs]);

  async function finish() {
    setPhase("submitting");
    const { outcome } = await actions.confirmReservation();
    if (outcome === "confirmed" || outcome === "already_confirmed") return router.push("/book/confirmed");
    setPhase("ready");
    fail(outcome);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || phase === "submitting" || phase === "processing") return; // no double submits
    if (!consent) return fail("consent_required");
    inFlight.current = true;
    try {
      await submitOnce();
    } finally {
      inFlight.current = false;
    }
  }

  async function submitOnce() {
    setError(null);
    setPhase("submitting");

    const consentResult = await actions.giveConsent({ accepted: consent, termsVersion });
    if (!consentResult.ok) {
      setPhase(stripeRef.current ? "ready" : "saved");
      return fail(consentResult.reason ?? "error");
    }

    if (phase === "saved") return finish();

    if (testMode) {
      const simulated = await actions.simulateCardSetup?.();
      if (!simulated?.ok) {
        setPhase("ready");
        return fail(simulated?.reason ?? "test_mode_unavailable");
      }
      return finish();
    }
    if (!stripeRef.current) return finish();

    const { stripe, elements } = stripeRef.current;
    const { error: stripeError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: `${window.location.origin}/book/complete` },
    });
    if (stripeError) {
      setPhase("ready");
      // Stripe's own message for card problems (declined, incomplete, failed verification).
      return setError({ text: stripeError.message ?? checkoutMessage("error"), startOver: false });
    }
    if (setupIntent?.status === "succeeded") return finish();
    if (setupIntent?.status === "processing") {
      setPhase("processing");
      return;
    }
    setPhase("ready");
    setError({ text: "Your card couldn't be saved. Please try a different card.", startOver: false });
  }

  if (phase === "unavailable") {
    return (
      <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
        {error?.text ?? checkoutMessage("payments_unavailable")}{" "}
        {error?.startOver && (
          <Link href="/#editions" className="font-medium underline">
            Choose a position
          </Link>
        )}
      </p>
    );
  }

  const busy = phase === "submitting" || phase === "loading";
  return (
    <form onSubmit={submit} className="flex flex-col gap-5" aria-busy={busy}>
      {testMode && (
        <p role="note" className="rounded-xl border-2 border-dashed border-warning-line bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
          TEST MODE (development only): no card is saved and no payment is authorized. This creates a TEST
          reservation, not a real booking.
        </p>
      )}
      {phase === "saved" ? (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">Your card is already saved. Just confirm below.</p>
      ) : testMode ? (
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <p className="font-medium">Simulated card</p>
          <p className="mt-1 text-muted">Stands in for Stripe&apos;s card form while testing. Nothing is sent to Stripe.</p>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-sm font-medium">Card details</p>
          <div ref={mountRef} className="min-h-[120px] rounded-xl border border-line bg-surface p-4">
            {phase === "loading" && <p className="text-sm text-muted">Loading secure card form…</p>}
          </div>
          <p className="mt-2 text-xs text-muted">Card details go straight to Stripe, our payment processor. Inside914 never sees or stores your card number.</p>
        </div>
      )}

      <label className="flex gap-3 rounded-xl border border-line bg-surface p-4 text-sm leading-6">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
          aria-describedby="consent-links"
        />
        <span>{consentText}</span>
      </label>
      <p id="consent-links" className="-mt-2 text-xs text-muted">
        Please read our{" "}
        <Link href="/legal/terms" target="_blank" className="underline">Advertising terms</Link>,{" "}
        <Link href="/legal/reservation-policy" target="_blank" className="underline">Reservation and cancellation policy</Link> and{" "}
        <Link href="/legal/privacy" target="_blank" className="underline">Privacy policy</Link>.
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {error.text}{" "}
          {error.startOver && (
            <Link href="/#editions" className="font-medium underline">
              Choose a position
            </Link>
          )}
        </p>
      )}
      {phase === "processing" && (
        <p role="status" className="rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent">
          Your bank is still confirming your card. We&apos;ll finish your reservation and email you as soon as it&apos;s done.
        </p>
      )}

      <button
        type="submit"
        disabled={busy || phase === "processing" || !consent || (phase === "ready" && !cardComplete)}
        className="rounded-full bg-foreground px-6 py-3.5 text-base font-medium text-background hover:bg-accent disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
      >
        {phase === "submitting"
          ? testMode
            ? "Creating test reservation…"
            : "Saving your card…"
          : testMode
            ? "Simulate card and create TEST reservation"
            : "Save card and reserve my space"}
      </button>
      <p className="text-center text-xs text-muted">You won&apos;t be charged today.</p>
    </form>
  );
}
