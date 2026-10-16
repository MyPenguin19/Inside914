import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { releaseCurrentHold } from "@/app/(public)/actions/booking";
import { BookingSteps } from "@/components/booking/booking-steps";
import { HoldCountdown } from "@/components/booking/hold-countdown";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getHeldBooking } from "@/lib/booking/held-booking";
import { HOLD_COOKIE } from "@/lib/booking/place-hold";
import { formatIssueMonth, formatPrice } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Your hold · Inside914" };

export default function HoldPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <BookingSteps current={3} />
        <Suspense fallback={<div className="mt-8 h-72 animate-pulse rounded-2xl border border-line bg-surface" />}>
          <HoldDetails />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function HoldDetails() {
  const token = (await cookies()).get(HOLD_COOKIE)?.value;
  if (!token) return <NoHold />;

  let booking;
  try {
    booking = await getHeldBooking(createAdminClient(), token);
  } catch (error) {
    console.error(error);
    return (
      <Panel title="We couldn't load your hold">
        <p className="text-muted">Please refresh the page in a moment. Holds last 15 minutes.</p>
      </Panel>
    );
  }
  if (!booking) return <NoHold />;

  const where = `${booking.positions[0]?.side === "back" ? "Back" : "Front"} · ${booking.positions.map((p) => p.label).join(" + ")}`;

  if (booking.state === "expired") {
    return (
      <Panel title="Your hold has expired">
        <p className="text-muted">
          Holds last 15 minutes. {where} may still be open. Go back to the postcard to check and hold it again.
        </p>
        <Link
          href={`/editions/${booking.editionId}`}
          className="mt-5 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-accent"
        >
          Back to the postcard
        </Link>
      </Panel>
    );
  }

  return (
    <Panel title="Your position is on hold">
      <p className="text-muted">
        We&apos;re holding this spot for you for <HoldCountdown expiresAt={booking.expiresAt} />. Nothing has been
        charged.
      </p>
      <dl className="mt-6 grid gap-4 border-y border-line py-5 text-sm sm:grid-cols-2">
        <Item label="Edition" value={`${booking.zoneName} · ${formatIssueMonth(booking.issueMonth)}`} />
        <Item label="Position" value={where} />
        <Item label="Size" value={booking.size === "double" ? "Double (two side-by-side positions)" : "Standard"} />
        <Item label="Price" value={formatPrice(booking.priceCents)} />
      </dl>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/book/artwork"
          className="rounded-full bg-foreground px-5 py-2.5 text-center text-sm font-medium text-background hover:bg-accent"
        >
          Continue to artwork upload
        </Link>
        <form action={releaseCurrentHold}>
          <input type="hidden" name="editionId" value={booking.editionId} />
          <button type="submit" className="w-full rounded-full border border-line px-5 py-2.5 text-sm hover:border-foreground">
            Change selection
          </button>
        </form>
      </div>
    </Panel>
  );
}

function NoHold() {
  return (
    <Panel title="You don't have a position on hold">
      <p className="text-muted">Choose an edition and a spot on the postcard to place a 15-minute hold.</p>
      <Link href="/#editions" className="mt-5 inline-block text-sm font-medium text-accent underline">
        See open editions
      </Link>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
