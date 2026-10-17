import { connection } from "next/server";
import { AreaCards } from "@/components/booking/area-cards";
import { TestCheckoutNotice } from "@/components/checkout/test-checkout-notice";
import { Card, Notice } from "@/components/ui/primitives";
import { areaCardsFrom, PLANNED_AREAS } from "@/lib/catalog/areas";
import { getBookableEditions } from "@/lib/catalog/queries";

// Loads published, bookable editions from Supabase and renders them, or an empty/error state.
export async function LiveAreas() {
  await connection(); // availability is per request, never prerendered
  let editions;
  try {
    editions = await getBookableEditions();
  } catch (error) {
    console.error(error);
    return (
      <div className="mt-6">
        <Notice tone="danger" role="alert">
          We couldn&apos;t load the advertising areas right now. Nothing has changed with any reservation. Please refresh
          the page in a moment.
        </Notice>
      </div>
    );
  }
  return (
    <>
      {editions.some((e) => e.pricingMode === "test") && (
        <div className="mt-4">
          <TestCheckoutNotice />
        </div>
      )}
      {editions.length === 0 && (
        <Card className="mt-6">
          <h2 className="font-medium">No campaigns are open for booking right now.</h2>
          <p className="mt-1 text-sm text-muted">New editions open regularly. Please check back soon.</p>
        </Card>
      )}
      <AreaCards areas={areaCardsFrom(editions, PLANNED_AREAS)} />
    </>
  );
}
