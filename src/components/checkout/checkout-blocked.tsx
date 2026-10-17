import Link from "next/link";
import { redirect } from "next/navigation";
import { Panel } from "@/components/booking/hold-state-panel";
import { checkoutMessage } from "@/lib/checkout/messages";

// Shown (or redirected) when the visitor's booking can't go through this checkout step.
export function CheckoutBlocked({ reason, editionId }: { reason: string; editionId?: string }) {
  if (reason === "already_confirmed") redirect("/book/confirmed");
  if (reason === "artwork_missing") redirect("/book/artwork");
  if (reason === "contact_missing") redirect("/book/details");
  return (
    <Panel title={reason === "hold_expired" ? "Your hold has ended" : "We can't continue this booking"}>
      <p className="text-muted">{checkoutMessage(reason)}</p>
      <Link
        href={editionId ? `/editions/${editionId}` : "/areas"}
        className="mt-5 inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-accent"
      >
        Choose a position
      </Link>
    </Panel>
  );
}
