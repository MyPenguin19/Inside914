import { connection } from "next/server";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MultiAreaSelector } from "@/components/booking/multi-area-selector";
import { getBookableEditions, getEditionCatalog } from "@/lib/catalog/queries";
import { findRegion } from "@/lib/catalog/regions";
export default function Page() {
  return (
    <>
      <SiteHeader />
      <main className="page-width flex-1 py-8">
        <h1 className="mb-6 text-3xl font-semibold">
          Reserve in multiple areas
        </h1>
        <Suspense fallback={<p>Loading available campaigns…</p>}>
          <Catalog />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
async function Catalog() {
  await connection();
  const editions = (await getBookableEditions()).filter((e) =>
    findRegion(e.zoneSlug),
  );
  const catalogs = await Promise.all(
    editions.map((e) => getEditionCatalog(e.id)),
  );
  const available = catalogs.filter((c) => c !== null);
  return available.length ? (
    <MultiAreaSelector catalogs={available} />
  ) : (
    <p>
      No campaigns are currently open. Please check back when reservations open.
    </p>
  );
}
