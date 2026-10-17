"use client";

import { ReservationSummary } from "@/components/checkout/reservation-summary";
import { demoReservationView } from "@/components/demo/demo-ad-view";
import { useDemoStore } from "@/components/demo/demo-store";
import { NeedSelection } from "@/components/demo/need-selection";
import { ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow, Notice } from "@/components/ui/primitives";
import { Timeline } from "@/components/ui/timeline";
import { DEMO_ZONES } from "@/lib/demo/data";

export default function DemoConfirmedPage() {
  const { selection, artwork, contact, hydrated } = useDemoStore();
  if (!hydrated) return <div className="mx-auto h-96 max-w-4xl animate-pulse rounded-2xl bg-background-soft" />;
  if (!selection) return <NeedSelection />;
  const view = demoReservationView(selection, artwork, contact);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Notice tone="warning" role="note">
        <strong>Demonstration:</strong> no real reservation was created, no card was saved and no email was sent.
      </Notice>

      <Card className="sm:p-8">
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-xl text-white">
          ✓
        </span>
        <Eyebrow className="mt-6">Reference {view.reference}</Eyebrow>
        <h1 className="mt-3 font-display text-4xl font-medium tracking-tight sm:text-5xl">Your Advertising Space Is Reserved.</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
          Thank you, {view.businessName}. <strong className="text-foreground">No payment has been collected.</strong> Once every
          space on the postcard is reserved and the campaign is approved, we&apos;ll charge the authorized amount and let you
          know.
        </p>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <ReservationSummary view={view} amountLabel="Authorized future charge" zones={DEMO_ZONES} />
        <Card as="section">
          <h2 className="text-lg font-semibold">What happens next</h2>
          <div className="mt-5">
            <Timeline
              label="What happens next"
              steps={[
                { title: "Confirmation email", state: "current", description: "With a private link to your reservation." },
                { title: "Artwork review", state: "upcoming", description: "Our team checks your ad before printing." },
                { title: "Postcard fills", state: "upcoming", description: "We charge your saved card and let you know." },
                { title: "Print and mail", state: "upcoming", description: "Follow every step on your Verified Mail page." },
              ]}
            />
          </div>
          <ButtonLink href="/demo/verified-mail" className="mt-6 w-full sm:w-auto">
            Preview your Verified Mail page
          </ButtonLink>
        </Card>
      </div>
    </div>
  );
}
