import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CategoryCheckout } from "@/components/booking/category-checkout";
export default function Page() {
  return (
    <>
      <SiteHeader />
      <main className="page-width flex-1 py-8">
        <h1 className="mb-6 text-3xl font-semibold">
          Choose your areas
        </h1>
        <Suspense fallback={<p>Loading available campaigns…</p>}>
          <CategoryCheckout />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
