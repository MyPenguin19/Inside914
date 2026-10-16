import Link from "next/link";
import type { EditionSummary } from "@/lib/catalog/queries";
import { formatDeadline, formatHouseholds, formatIssueMonth, formatPrice } from "@/lib/format";

export function EditionCard({ edition }: { edition: EditionSummary }) {
  const soldOut = edition.availableUnits === 0;
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-6">
      <p className="text-sm text-muted">{formatIssueMonth(edition.issueMonth)} edition</p>
      <h3 className="mt-1 text-xl font-semibold tracking-tight">{edition.zoneName}</h3>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-muted">Planned mailing</dt>
          <dd className="font-medium">≈ {formatHouseholds(edition.households)} homes</dd>
        </div>
        <div>
          <dt className="text-muted">Open positions</dt>
          <dd className="font-medium">
            {edition.availableUnits} of {edition.totalUnits}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Standard ad</dt>
          <dd className="font-medium">{formatPrice(edition.unitPriceCents)}</dd>
        </div>
        <div>
          <dt className="text-muted">Artwork due</dt>
          <dd className="font-medium">{formatDeadline(edition.artworkDeadline)}</dd>
        </div>
      </dl>
      {soldOut ? (
        <p className="mt-6 rounded-full border border-line px-4 py-2 text-center text-sm text-muted">
          This edition is fully booked
        </p>
      ) : (
        <Link
          href={`/editions/${edition.id}`}
          className="mt-6 rounded-full bg-foreground px-5 py-2.5 text-center text-sm font-medium text-background hover:bg-accent"
        >
          View the postcard<span className="sr-only"> for {edition.zoneName}</span>
        </Link>
      )}
    </article>
  );
}
