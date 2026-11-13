import { placementDimensions } from "@/lib/print/layouts";

import { bookingSizeLabel } from "@/lib/booking/products";
import { CroppedImage } from "@/components/artwork/cropped-image";
import { PostcardPreview } from "@/components/artwork/postcard-preview";
import type { PostcardZone } from "@/components/postcard/postcard-side";
import type { ReservationView } from "@/lib/checkout/reservation";
import { formatDeadline, formatHouseholds, formatIssueMonth, formatPrice } from "@/lib/format";

// The booking at a glance: edition, position, size, artwork and the amount authorized.
export function ReservationSummary({
  view,
  amountLabel = "Total authorized",
  zones,
  provisional = false,
  showReservationTerms = true,
  label = "Reservation summary",
}: {
  label?: string;
  provisional?: boolean;
  showReservationTerms?: boolean;
  view: ReservationView;
  amountLabel?: string;
  zones?: PostcardZone[]; // printed non-ad areas, when the layout has them
}) {
  const side = view.size === "both_sides" ? "Front and back" : view.area.side === "front" ? "Front" : "Back";
  return (
    <section aria-label={label} className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold">Your reservation</h2>
      <div className="mt-4 grid grid-cols-[96px_minmax(0,1fr)] gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
        <div>{(view.areas ?? [view.area]).map(previewArea => <PostcardPreview layoutKey={view.layoutTemplate} dimensions={view.productModel === "square_v1" ? { width: 9, height: 6 } : undefined} key={previewArea.side} side={previewArea.side} otherSlots={view.otherSlots} area={previewArea} showSafeArea={false} compact zones={zones}>
          {view.artwork?.crop ? (
            <CroppedImage target={previewArea} src={view.artwork.viewUrl} imageWidth={view.artwork.width} imageHeight={view.artwork.height} crop={view.artwork.crop} alt="Your ad" />
          ) : (
            <div className="h-full bg-accent-soft" />
          )}
        </PostcardPreview>)}</div>
        <dl className="grid content-start gap-2 text-sm">
          {view.campaignName && <Row label="Campaign" value={view.campaignName} />}
          <Row label="Edition" value={`${view.zoneName} · ${formatIssueMonth(view.issueMonth)}`} />
          <Row label="Planned mailing" value={provisional ? (view.households > 0 ? `≈ ${formatHouseholds(view.households)} homes, provisional` : "Household count awaiting confirmation") : `≈ ${formatHouseholds(view.households)} homes`} />
          <Row label="Position" value={`${side} · ${view.positions.map((p) => p.label).join(" + ")}`} />
          <Row label="Size" value={view.productModel === "square_v1" ? placementDimensions(view.area) : bookingSizeLabel(view.size)} />
          <Row label="Reservation deadline" value={formatDeadline(view.artworkDeadline)} />
        </dl>
      </div>
      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
        <span className="text-sm text-muted">
          {amountLabel}
          {view.pricingMode === "test" && (
            <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">Test price</span>
          )}
        </span>
        <span className="font-display text-3xl font-medium">{formatPrice(view.priceCents)}</span>
      </div>
      {showReservationTerms&&<p className="mt-1 text-xs text-muted">Charged only if the campaign fills and is approved. Due today: $0.00.</p>}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
