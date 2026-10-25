import { marketingMetadata } from "@/lib/seo";
import { PUBLIC_CHECKOUT_RELEASED, CHECKOUT_CLOSED_MESSAGE } from "@/lib/checkout/release";
import { Suspense } from "react";
import { CategoryCheckout } from "@/components/booking/category-checkout";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = marketingMetadata(
  "/areas", "Westchester Advertising Areas",
  "Compare Central, Southern, Northern and Eastern Westchester advertising areas. Explore the map, proposed communities, campaign prices and postcard positions.",
);

// LIVE areas: campaigns and open-space counts come from Supabase (anon, RLS: published editions only).
export default function AreasPage() {
  return (
    <>
      <SiteHeader />
      <main className="page-width min-w-0 flex-1 break-words py-6 sm:py-8">
        <div className="mt-6">
          <h1 className="font-display text-4xl font-medium tracking-tight">Choose your areas.</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Pick where you want your ad. Prices are shown for each area. $0 today.
          </p>
          {!PUBLIC_CHECKOUT_RELEASED && <p className="mt-3 max-w-2xl text-sm text-muted">{CHECKOUT_CLOSED_MESSAGE}</p>}
        </div>
        <Suspense fallback={<AreasSkeleton />}>
          <div className="mt-6"><CategoryCheckout /></div>
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

function AreasSkeleton() {
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading advertising areas">
      <div className="h-80 animate-pulse rounded-2xl border border-line bg-surface" />
      <div className="h-48 animate-pulse rounded-2xl border border-line bg-surface" />
    </div>
  );
}
