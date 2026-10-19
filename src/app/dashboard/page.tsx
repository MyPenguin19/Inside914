import { Suspense } from "react";
import Link from "next/link";
import { requireAdvertiser } from "@/lib/advertiser/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getReservationView } from "@/lib/checkout/reservation";
import { ReservationSummary } from "@/components/checkout/reservation-summary";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading your reservations…</p>}>
      <Reservations />
    </Suspense>
  );
}
async function Reservations() {
  const { client, user } = await requireAdvertiser();
  const claim = await client.rpc("claim_advertiser_bookings");
  if (claim.error) throw new Error("Could not load reservations.");
  const { data: links, error } = await client
    .from("advertiser_bookings")
    .select("booking_id")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const admin = createAdminClient();
  const views = await Promise.all(
    (links ?? []).map((link) => getReservationView(admin, link.booking_id)),
  );
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Your advertiser dashboard</h1>
      <p className="break-words text-muted">
        Signed in as {user.email}. Reservations made with this verified email
        appear here, including each area in a multi-area booking.
      </p>
      {!views.length && (
        <p>
          No confirmed reservations yet.{" "}
          <Link href="/areas" className="underline">
            Choose an advertising area
          </Link>
          .
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        {views.map(
          (view) =>
            view && (
              <section key={view.bookingId} className="min-w-0 space-y-3">
                <ReservationSummary view={view} provisional />
                <p>
                  Status: <strong>{view.status.replaceAll("_", " ")}</strong>
                  {view.isTest ? " · TEST reservation" : ""}
                </p>
                <Link
                  href={`/dashboard/${view.bookingId}`}
                  className="font-medium underline"
                >
                  Manage {view.zoneName} · {view.reference}
                </Link>
              </section>
            ),
        )}
      </div>
    </div>
  );
}
