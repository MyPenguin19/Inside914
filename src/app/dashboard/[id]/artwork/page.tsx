import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireReservation, canEditReservation } from "@/lib/advertiser/auth";
import { getReservationView } from "@/lib/checkout/reservation";
import { ArtworkStudio } from "@/components/artwork/artwork-studio";
import {
  requestRevision,
  finalizeRevision,
  saveRevision,
  discardRevision,
  noExtension,
} from "../../actions";
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
    .select("status,editions(status,artwork_due_at,artwork_deadline)")
    .eq("id", id)
    .single();
  if (!b?.editions || !canEditReservation(b, b.editions))
    return <p>Artwork changes are closed. Contact support for help.</p>;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">
        Update artwork · {view.zoneName}
      </h1>
      <p>
        Your existing artwork stays in place until you save. A replacement will
        be sent for review again.
      </p>
      <ArtworkStudio
        key={id}
        reservationMode
        hold={{
          expiresAt: b.editions.artwork_due_at ?? b.editions.artwork_deadline,
          extensionsLeft: 0,
        }}
        ad={{
          side: view.area.side,
          area: view.area,
          labels: view.positions.map((p) => p.label),
          size: view.size,
          priceCents: view.priceCents,
        }}
        otherSlots={view.otherSlots}
        initialArtwork={null}
        nextHref={`/dashboard/${id}`}
        restartHref={`/dashboard/${id}`}
        continueLabel="Save replacement artwork"
        actions={{
          requestUpload: requestRevision.bind(null, id),
          finalizeUpload: finalizeRevision.bind(null, id),
          saveLayout: saveRevision.bind(null, id),
          removeArtwork: discardRevision.bind(null, id),
          extendHold: noExtension,
        }}
      />
    </div>
  );
}
