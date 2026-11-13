import Link from "next/link";
import { REGIONS } from "@/lib/catalog/regions";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AREA_GUIDE } from "@/components/booking/westchester-map-data";
import { REGION_CONTENT } from "@/lib/seo-regions";
import { regionStructuredData } from "@/lib/structured-data";
import { PUBLIC_CHECKOUT_RELEASED, CHECKOUT_CLOSED_MESSAGE } from "@/lib/checkout/release";

// Four explicit routes share this server-only presentation. Unknown paths are real 404s,
// rather than streaming a dynamic segment's not-found UI after a 200 response.
export function AreaLandingPage({ region }: { region: (typeof REGIONS)[number] }) {
  const copy = REGION_CONTENT[region.slug];
  const guide = AREA_GUIDE[region.slug];
  const schema = regionStructuredData(region.slug, copy.title, copy.description);
  return <>
    <SiteHeader />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <main id="main-content" tabIndex={-1} className="page-width min-w-0 flex-1 break-words py-10 sm:py-14">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex flex-wrap gap-2">
          <li><Link className="underline hover:text-foreground" href="/">Home</Link></li>
          <li><span aria-hidden="true">/ </span><Link className="underline hover:text-foreground" href="/areas">Advertising areas</Link></li>
          <li aria-current="page"><span aria-hidden="true">/ </span>{region.name}</li>
        </ol>
      </nav>
      <article className="mt-9 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Westchester County, New York</p>
        <h1 className="mt-3 text-balance font-display text-4xl font-medium leading-tight tracking-tight sm:text-5xl">{copy.title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">{copy.intro}</p>
        <h2 className="mt-10 font-display text-2xl font-medium">Communities in the proposed area</h2>
        <p className="mt-4 leading-relaxed text-muted">{guide.description} These examples come from the existing Inside914 area map. They are not confirmed delivery locations.</p>
        <ul className="mt-5 grid list-inside list-disc gap-x-6 gap-y-3 rounded-xl border border-line bg-surface p-5 sm:grid-cols-2">
          {guide.municipalities.map(town => <li key={town.id}>{town.name}</li>)}
        </ul>
        <p className="mt-4 text-sm text-muted">Municipality names follow the <a className="underline" href="https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Civil_Boundaries/MapServer/6">New York State civil boundaries source</a> used by our map. Inside914’s four groupings are proposed, not official postal regions.</p>
        <h2 className="mt-10 font-display text-2xl font-medium">{copy.heading}</h2>
        <p className="mt-4 leading-relaxed text-muted">{copy.audience}</p>
        <ul className="mt-4 list-disc space-y-3 pl-5 leading-relaxed text-muted">{copy.tips.map(tip => <li key={tip}>{tip}</li>)}</ul>
        <h2 className="mt-10 font-display text-2xl font-medium">How to participate in a shared campaign</h2>
        <p className="mt-4 leading-relaxed text-muted">Inside914’s standard shared postcard has ten paid positions. Businesses select an area, a position and their artwork. No payment is collected when reserving; a future charge can only happen after the campaign fills and receives the required approvals. Each area has its own price and fill status, shown on the advertising areas page.</p>
        {!PUBLIC_CHECKOUT_RELEASED && <p className="mt-4 font-medium">{CHECKOUT_CLOSED_MESSAGE}</p>}
        <h2 className="mt-10 font-display text-2xl font-medium">Review the mailing area before committing</h2>
        <p className="mt-4 leading-relaxed text-muted">Area groupings are planning guides. Postal routes, final household quantities, mailing dates and printer specifications must be confirmed for the individual campaign. An area name is not a promise to deliver to every address in that region.</p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:bg-accent" href="/areas">Explore all advertising areas</Link>
          <Link className="rounded-full border border-line px-6 py-3 text-sm font-medium hover:bg-background-soft" href="/how-it-works">How shared mail works</Link>
        </div>
        <h2 className="mt-12 font-display text-2xl font-medium">Other Westchester advertising areas</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {REGIONS.filter(item => item.slug !== region.slug).map(item => <li key={item.slug}><Link href={`/areas/${item.slug}`} className="underline decoration-line-strong underline-offset-4 hover:text-accent">{item.name}</Link></li>)}
        </ul>
        <p className="mt-9 text-sm text-muted">Questions? Contact <a className="underline" href="mailto:Info@inside914.com">Info@inside914.com</a>. Inside914 is operated by Inside Diagnostics LLC.</p>
      </article>
    </main>
    <SiteFooter />
  </>;
}
