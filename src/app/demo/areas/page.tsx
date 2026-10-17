import { DemoSteps } from "@/components/demo/demo-steps";
import { ButtonLink } from "@/components/ui/button";
import { Card, StatusBadge } from "@/components/ui/primitives";
import { DEMO_AREAS, DEMO_EDITION } from "@/lib/demo/data";
import { formatDeadline, formatHouseholds, formatPrice } from "@/lib/format";

export default function DemoAreasPage() {
  return (
    <div>
      <DemoSteps current={1} />
      <div className="mt-6">
        <h1 className="font-display text-4xl font-medium tracking-tight">Choose your advertising area.</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Each area is one postcard mailed to homes in that part of Westchester. We plan the mailing routes for you.
        </p>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {DEMO_AREAS.map((area) => (
          <Card key={area.name} as="article" className={`flex flex-col ${area.status === "soon" ? "opacity-75" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted">{area.edition}</p>
                <h2 className="mt-1 font-display text-2xl font-medium">{area.name}</h2>
              </div>
              {area.status === "available" ? <StatusBadge tone="success">Available</StatusBadge> : <StatusBadge>Coming soon</StatusBadge>}
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              {area.towns} <span className="font-medium text-foreground">(provisional; final routes are set by Inside914)</span>
            </p>
            {area.status === "available" ? (
              <>
                <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 text-sm">
                  <div>
                    <dt className="text-muted">Planned mailing</dt>
                    <dd className="font-medium">≈ {formatHouseholds(area.households!)} homes</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Open spaces</dt>
                    <dd className="font-medium">
                      {DEMO_EDITION.availableUnits} of {DEMO_EDITION.totalUnits} (sample)
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Prices</dt>
                    <dd className="font-medium">
                      {formatPrice(DEMO_EDITION.unitPriceCents)} / {formatPrice(DEMO_EDITION.doublePriceCents!)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Reserve by</dt>
                    <dd className="font-medium">{formatDeadline(DEMO_EDITION.artworkDeadline)}</dd>
                  </div>
                </dl>
                <ButtonLink href="/demo/postcard" size="lg" className="mt-6">
                  See open spaces<span className="sr-only"> in {area.name}</span>
                </ButtonLink>
              </>
            ) : (
              <p className="mt-6 text-sm text-muted">We&apos;re planning this edition. Check back soon.</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
