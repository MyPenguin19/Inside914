"use client";

import { ReservationSummary } from "@/components/checkout/reservation-summary";
import { demoReservationView } from "@/components/demo/demo-ad-view";
import { useDemoStore } from "@/components/demo/demo-store";
import { NeedSelection } from "@/components/demo/need-selection";
import { ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow, Notice } from "@/components/ui/primitives";

export default function DemoConfirmedPage() {
  const { selection, artwork, contact } = useDemoStore();
  if (!selection) return <NeedSelection />;
  const view = demoReservationView(selection, artwork, contact);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Notice tone="warning" role="note">
        <strong>Demonstration:</strong> no real reservation was created, no card was saved and no email was sent.
      </Notice>
      <Card className="p-6 sm:p-10">
        <Eyebrow>Reference {view.reference}</Eyebrow>
        <h1 className="mt-3 font-display text-4xl font-medium tracking-tight sm:text-5xl">Your Advertising Space Is Reserved.</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          Thank you, {view.businessName}. <strong className="text-foreground">No payment has been collected.</strong> Once all
          postcard spaces are reserved and the campaign is approved, we&apos;ll attempt the authorized charge and notify you.
        </p>
      </Card>
      <ReservationSummary view={view} amountLabel="Authorized future charge" />
      <Card>
        <h2 className="font-medium">What happens next</h2>
        <ol className="mt-4 grid gap-3 text-sm text-muted">
          <li><strong className="text-foreground">1. Confirmation email</strong> with a private link to your reservation.</li>
          <li><strong className="text-foreground">2. Artwork review</strong> by our team before printing.</li>
          <li><strong className="text-foreground">3. Campaign fills</strong>: we charge your saved card and let you know.</li>
          <li><strong className="text-foreground">4. Print and mail</strong>, tracked on your Verified Mail page.</li>
        </ol>
        <ButtonLink href="/demo/verified-mail" variant="secondary" className="mt-6">
          Preview your Verified Mail page
        </ButtonLink>
      </Card>
    </div>
  );
}
