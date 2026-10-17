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
}: {
  view: ReservationView;
  amountLabel?: string;
  zones?: PostcardZone[]; // printed non-ad areas, when the layout has them
}) {
  const side = view.area.side === "front" ? "Front" : "Back";
  return (
    <section aria-label="Reservation summary" className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold">Your reservation</h2>
      <div className="mt-4 grid grid-cols-[96px_minmax(0,1fr)] gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
        <PostcardPreview side={view.area.side} otherSlots={view.otherSlots} area={view.area} showSafeArea={false} compact zones={zones}>
          {view.artwork?.crop ? (
            <CroppedImage src={view.artwork.viewUrl} imageWidth={view.artwork.width} imageHeight={view.artwork.height} crop={view.artwork.crop} alt="Your ad" />
          ) : (
            <div className="h-full bg-accent-soft" />
          )}
        </PostcardPreview>
        <dl className="grid content-start gap-2 text-sm">
          <Row label="Edition" value={`${view.zoneName} · ${formatIssueMonth(view.issueMonth)}`} />
          <Row label="Planned mailing" value={`≈ ${formatHouseholds(view.households)} homes`} />
          <Row label="Position" value={`${side} · ${view.positions.map((p) => p.label).join(" + ")}`} />
          <Row label="Size" value={view.size === "double" ? "Double (two side-by-side spaces)" : "Standard"} />
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
      <p className="mt-1 text-xs text-muted">Charged only if the campaign fills and is approved. $0 today.</p>
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
