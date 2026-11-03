import { BookingSteps } from "./booking-steps";
import { WestchesterMap } from "./westchester-map";
import { AREA_GUIDE } from "./westchester-map-data";
import { REGIONS } from "@/lib/catalog/regions";

const placeholder = "rounded-lg bg-background-soft motion-safe:animate-pulse";

// These shells contain no cached reservation, price or availability data.
export function AreasLoading() {
  return <div className="mt-6 space-y-6" aria-busy="true" aria-label="Loading advertising areas">
    <BookingSteps current={1} />
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div className="order-2 lg:order-1"><WestchesterMap loading areas={REGIONS.map(region => ({ slug: region.slug, selected: false, available: false, status: "Checking…" }))} /></div>
      <div className="order-1 space-y-3 lg:order-2">
        <h2 className="text-xl font-semibold">Pick one or more areas</h2>
        <p role="status" className="text-sm text-muted">Checking current prices and available positions…</p>
        {REGIONS.map(region => <div key={region.slug} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <p className="font-semibold">{region.name}</p>
          <div aria-hidden="true" className={`${placeholder} h-4 w-40`} />
          <p className="text-sm text-muted">{AREA_GUIDE[region.slug].municipalities.slice(0, 6).map(town => town.name).join(" · ")}</p>
        </div>)}
      </div>
    </div>
  </div>;
}

export function BookingLoading({ step, title, message, showSteps = true, form = false }: {
  step: 2 | 3 | 4;
  title: string;
  message: string;
  showSteps?: boolean;
  form?: boolean;
}) {
  return <section className={`${showSteps ? "" : "mt-6 "}space-y-6`} aria-busy="true" aria-label={message}>
    {showSteps && <BookingSteps current={step} />}
    <h1 className="text-3xl font-semibold">{title}</h1>
    <p role="status" className="text-sm text-muted">{message}</p>
    <div aria-hidden="true" className={form ? "max-w-xl space-y-5" : "grid gap-6 md:grid-cols-2"}>
      {form ? [0, 1, 2, 3].map(i => <div key={i} className="space-y-2">
        <div className={`${placeholder} h-4 w-28`} />
        <div className="h-12 rounded-xl border border-line bg-surface" />
      </div>) : [0, 1].map(i => <div key={i} className="space-y-5 rounded-2xl border border-line bg-surface p-5">
        <div className={`${placeholder} h-6 w-40`} />
        <div className={`${placeholder} aspect-[3/2] w-full`} />
        <div className={`${placeholder} h-4 w-2/3`} />
      </div>)}
    </div>
  </section>;
}
