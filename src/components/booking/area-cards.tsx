import { ButtonLink } from "@/components/ui/button";
import { Card, StatusBadge } from "@/components/ui/primitives";
import { formatDay, formatDeadline, formatHouseholds, formatPrice } from "@/lib/format";

// One card per advertising area. Shared by the live areas page (Supabase) and the design preview
// (sample data), so both look identical.
export type AreaCard =
  | {
      status: "available";
      name: string;
      edition: string; // e.g. "January 2027 edition"
      towns?: string;
      households: number;
      openSpaces: number;
      totalSpaces: number;
      unitPriceCents: number;
      doublePriceCents: number | null;
      reserveBy: string; // timestamp
      mailDate?: string | null; // date only
      href: string;
      sample?: boolean; // design preview: label counts as sample
    }
  | { status: "full" | "soon"; name: string; edition: string; towns?: string };

export function AreaCards({ areas }: { areas: AreaCard[] }) {
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {areas.map((area) => (
        <Card key={area.name + area.edition} as="article" className={`flex flex-col ${area.status === "soon" ? "opacity-75" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">{area.edition}</p>
              <h2 className="mt-1 font-display text-2xl font-medium">{area.name}</h2>
            </div>
            {area.status === "available" ? (
              <StatusBadge tone="success">Available</StatusBadge>
            ) : area.status === "full" ? (
              <StatusBadge>Fully reserved</StatusBadge>
            ) : (
              <StatusBadge>Coming soon</StatusBadge>
            )}
          </div>
          {area.towns && (
            <p className="mt-4 text-sm leading-relaxed text-muted">
              {area.towns} <span className="font-medium text-foreground">(provisional; final routes are set by Inside914)</span>
            </p>
          )}
          {area.status === "available" ? (
            <>
              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 text-sm">
                <div>
                  <dt className="text-muted">Planned mailing</dt>
                  <dd className="font-medium">≈ {formatHouseholds(area.households)} homes</dd>
                </div>
                <div>
                  <dt className="text-muted">Open spaces</dt>
                  <dd className="font-medium">
                    {area.openSpaces} of {area.totalSpaces}
                    {area.sample && " (sample)"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Prices</dt>
                  <dd className="font-medium">
                    {formatPrice(area.unitPriceCents)}
                    {area.doublePriceCents !== null && ` / ${formatPrice(area.doublePriceCents)}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Reserve by</dt>
                  <dd className="font-medium">{formatDeadline(area.reserveBy)}</dd>
                </div>
                {area.mailDate && (
                  <div>
                    <dt className="text-muted">Planned mail date</dt>
                    <dd className="font-medium">{formatDay(area.mailDate)}</dd>
                  </div>
                )}
              </dl>
              <ButtonLink href={area.href} size="lg" className="mt-6">
                See open spaces<span className="sr-only"> in {area.name}</span>
              </ButtonLink>
            </>
          ) : (
            <p className="mt-6 text-sm text-muted">
              {area.status === "full" ? "Every space on this postcard is taken." : "We're planning this edition. Check back soon."}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
