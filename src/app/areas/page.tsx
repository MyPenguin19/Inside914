import { Suspense } from "react";
import { CategoryCheckout } from "@/components/booking/category-checkout";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Advertising areas · Inside914" };

// LIVE areas: campaigns and open-space counts come from Supabase (anon, RLS: published editions only).
export default function AreasPage() {
  return (
    <>
      <SiteHeader />
      <main className="page-width flex-1 py-6 sm:py-8">
        <div className="mt-6">
          <h1 className="font-display text-4xl font-medium tracking-tight">Choose your areas.</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Pick where you want your ad. $399 per area. $0 today.
          </p>
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
