import Link from "next/link";
import { BookingSteps } from "@/components/booking/booking-steps";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Artwork upload · Inside914" };

// Placeholder for the next step: says plainly that upload isn't available yet.
export default function ArtworkPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <BookingSteps current={4} />
        <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Coming next</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Artwork upload isn&apos;t open yet</h1>
          <p className="mt-3 text-muted">
            This is where you&apos;ll upload your ad image and fit it to your position. We&apos;re still building this
            step, so you can&apos;t upload artwork or complete a booking online yet.
          </p>
          <p className="mt-3 text-muted">
            Your hold lasts 15 minutes and then ends on its own. Nothing has been charged.
          </p>
          <Link
            href="/book/hold"
            className="mt-6 inline-block rounded-full border border-line px-5 py-2.5 text-sm hover:border-foreground"
          >
            Back to your hold
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
