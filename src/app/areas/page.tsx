import { AreasLoading } from "@/components/booking/booking-loading";
import Link from "next/link";
import { MARKETING_PAGES } from "@/lib/marketing-content";
import { REGIONS } from "@/lib/catalog/regions";
import { MarketingBreadcrumb, MarketingPageSeo } from "@/components/marketing/page-seo";
import { absoluteUrl, marketingMetadata } from "@/lib/seo";
import { PUBLIC_CHECKOUT_RELEASED, CHECKOUT_CLOSED_MESSAGE } from "@/lib/checkout/release";
import { Suspense } from "react";
import { CategoryCheckout } from "@/components/booking/category-checkout";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const copy = MARKETING_PAGES["/areas"];
export const metadata = marketingMetadata("/areas", copy.title, copy.description);

// LIVE areas: campaigns and open-space counts come from Supabase (anon, RLS: published editions only).
export default function AreasPage() {
  return (
    <>
      <SiteHeader />
      <MarketingPageSeo path="/areas" type="CollectionPage" mainEntity={{
        "@type": "ItemList", name: "Westchester advertising area guides",
        itemListElement: REGIONS.map((region, index) => ({ "@type": "ListItem", position: index + 1, name: region.name, url: absoluteUrl(`/areas/${region.slug}`) })),
      }} />
      <main id="main-content" tabIndex={-1} className="page-width min-w-0 flex-1 break-words py-10 sm:py-14">
        <MarketingBreadcrumb label="Advertising Areas" />
        <div className="mt-6">
          <h1 className="font-display text-4xl font-medium tracking-tight">Choose your areas.</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Pick where you want your ad. Prices are shown for each area. $0 today.
          </p>
          {!PUBLIC_CHECKOUT_RELEASED && <p className="mt-3 max-w-2xl text-sm text-muted">{CHECKOUT_CLOSED_MESSAGE}</p>}
        </div>
        <Suspense fallback={<AreasLoading />}>
          <div className="mt-8"><CategoryCheckout /></div>
        </Suspense>
        <section className="mt-12" aria-labelledby="area-guide-title">
          <h2 id="area-guide-title" className="font-display text-3xl font-medium">Explore the Westchester area guides</h2>
          <p className="mt-3 max-w-2xl text-muted">Compare proposed communities with the places your business serves. Final mailing routes and household quantities are confirmed for each campaign.</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {REGIONS.map(region => <li key={region.slug}><Link href={`/areas/${region.slug}`} className="block rounded-xl border border-line bg-surface p-4 font-medium hover:text-accent">{region.name}</Link></li>)}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
