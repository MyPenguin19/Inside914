import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireReservation, canEditReservation } from "@/lib/advertiser/auth";
import { getReservationView } from "@/lib/checkout/reservation";
import { ReservationSummary } from "@/components/checkout/reservation-summary";
import { DetailsForm, CancelForm } from "../forms";
import { SUPPORT_EMAIL } from "@/lib/support";
export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p>Loading your reservation…</p>}>
      <Reservation {...props} />
    </Suspense>
  );
}
async function Reservation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin } = await requireReservation(id);
  const view = await getReservationView(admin, id);
  if (!view) notFound();
  const { data: b } = await admin
    .from("bookings")
    .select(
      "status,booking_contacts(*),editions(status,artwork_due_at,artwork_deadline),booking_artwork(review_status,review_note)",
    )
    .eq("id", id)
    .single();
  const editable = !!b?.editions && canEditReservation(b, b.editions);
  const cancellable =
    editable &&
    !!b?.editions &&
    canEditReservation(b, { ...b.editions, artwork_due_at: null });
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 space-y-6">
        <h1 className="text-3xl font-semibold">Manage your reservation</h1>
        <p>
          {view.zoneName} · {view.reference}
        </p>
        <p>
          Status: <strong>{view.status.replaceAll("_", " ")}</strong>
          {view.isTest ? " · TEST reservation" : ""}
        </p>
        <p>
          Artwork review:{" "}
          {b?.booking_artwork?.review_status.replaceAll("_", " ") ??
            "Not uploaded"}
        </p>
        {b?.booking_artwork?.review_note && (
          <p>{b.booking_artwork.review_note}</p>
        )}
        {editable ? (
          <>
            <Link
              href={`/dashboard/${id}/artwork`}
              className="font-medium underline"
            >
              Replace or reposition artwork
            </Link>
            <p className="text-sm text-muted">
              Upload a new copy to replace or reposition your ad. Your current
              artwork stays saved until you submit the replacement. Changes
              require another review.
            </p>
            <h2 className="text-xl font-semibold">Business details</h2>
            {b?.booking_contacts && (
              <DetailsForm id={id} contact={b.booking_contacts} />
            )}
            {cancellable && (
              <>
                <h2 className="text-xl font-semibold">Cancel this area</h2>
                <CancelForm id={id} />
              </>
            )}
          </>
        ) : (
          <p>
            Online changes are closed for this reservation. Contact{" "}
            <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>{" "}
            for help.
          </p>
        )}
      </section>
      <aside className="min-w-0">
        <ReservationSummary view={view} provisional />
      </aside>
    </div>
  );
}
