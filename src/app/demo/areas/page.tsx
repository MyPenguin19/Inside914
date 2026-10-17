import { DemoSteps } from "@/components/demo/demo-steps";
import { AreaCards } from "@/components/booking/area-cards";
import { DEMO_AREAS, DEMO_EDITION } from "@/lib/demo/data";

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
      <AreaCards
        areas={DEMO_AREAS.map((area) =>
          area.status === "available"
            ? {
                status: "available" as const,
                name: area.name,
                edition: area.edition,
                towns: area.towns,
                households: area.households!,
                openSpaces: DEMO_EDITION.availableUnits,
                totalSpaces: DEMO_EDITION.totalUnits,
                unitPriceCents: DEMO_EDITION.unitPriceCents,
                doublePriceCents: DEMO_EDITION.doublePriceCents,
                reserveBy: DEMO_EDITION.artworkDeadline,
                href: "/demo/postcard",
                sample: true,
              }
            : { status: "soon" as const, name: area.name, edition: area.edition, towns: area.towns },
        )}
      />
    </div>
  );
}
