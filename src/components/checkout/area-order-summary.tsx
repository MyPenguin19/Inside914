import type { ReservationView } from "@/lib/checkout/reservation";
import { formatPrice } from "@/lib/format";
import { CroppedImage } from "@/components/artwork/cropped-image";
import { ReservationSummary } from "./reservation-summary";

// Keep the customer's choices visible; full campaign/print details remain one click away.
export function AreaOrderSummary({ view }: { view: ReservationView }) {
  return <div className="space-y-3">
    <div className="flex items-start gap-3">
      {view.artwork?.crop && <div className="w-16 shrink-0 overflow-hidden rounded-lg border border-line" style={{ aspectRatio: `${view.area.width} / ${view.area.height}` }}>
        <CroppedImage target={view.area} src={view.artwork.viewUrl} imageWidth={view.artwork.width}
          imageHeight={view.artwork.height} crop={view.artwork.crop} alt={`Artwork for ${view.zoneName}`} />
      </div>}
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">{view.zoneName}</h2>
        <p className="text-sm text-muted">{view.area.side === "front" ? "Front" : "Back"} · {view.positions.map(p => p.label).join(" + ")}</p>
      </div>
      <p className="shrink-0 font-semibold">{formatPrice(view.priceCents)}</p>
    </div>
    <details className="text-sm">
      <summary className="cursor-pointer text-muted">Campaign details</summary>
      <div className="mt-3"><ReservationSummary provisional view={view} showReservationTerms={false} /></div>
    </details>
  </div>;
}
