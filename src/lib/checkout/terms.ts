import { formatPrice } from "@/lib/format";
import wording from "@/lib/legal/versions/2026-10-24-review-4-consent.json";

// Proposed draft: owner/counsel approval is required before production publication.
// Historical versions and accepted records remain unchanged; see docs/phase615.
export const TERMS_VERSION = "2026-10-24-review-4";
export const CART_TERMS_VERSION = "square-zones-2026-10-24-review-4";
export const DEADLINE_POLICY = "If the campaign is incomplete at its deadline, new reservations close while Inside914 reviews cancellation or revised dates. No charge occurs while the campaign is incomplete. Material changes to your billing agreement require your explicit agreement.";
export function consentText(amountCents: number) {
  return wording.single.replace("[ACTUAL AGREED PRICE]", formatPrice(amountCents));
}
export function cartConsentText(areas: {name:string;amount:number}[]) {
  if (!areas.length) throw new Error("A campaign is required for authorization");
  if (areas.length === 1) return consentText(areas[0].amount);
  const amounts = areas.map(a => `${a.name}: ${formatPrice(a.amount)}`).join("\n");
  return `${amounts}\n\n${wording.multi.replace("[ACTUAL SERVER-COMPUTED COMBINED TOTAL]", formatPrice(areas.reduce((n,a)=>n+a.amount,0)))}`;
}
