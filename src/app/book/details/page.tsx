import Link from "next/link";
import { BookingSteps } from "@/components/booking/booking-steps";
import { Panel } from "@/components/booking/hold-state-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Your details · Inside914" };

// Placeholder for the next step: says plainly that it isn't built yet. Nothing is confirmed.
export default function DetailsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <BookingSteps current={5} />
        <Panel title="Your details: coming next">
          <p className="text-muted">
            This is where you&apos;ll enter your business and contact details and save a card. We&apos;re still building
            this step, so your booking isn&apos;t confirmed and nothing has been charged.
          </p>
          <p className="mt-3 text-muted">Your hold ends on its own when its timer runs out.</p>
          <Link href="/book/review" className="mt-6 inline-block rounded-full border border-line px-5 py-2.5 text-sm hover:border-foreground">
            Back to review
          </Link>
        </Panel>
      </main>
      <SiteFooter />
    </>
  );
}
