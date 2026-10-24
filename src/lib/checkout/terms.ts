import { formatPrice } from "@/lib/format";

// Proposed draft: owner/counsel approval is required before production publication.
// Historical versions and accepted records remain unchanged; see docs/phase615.
export const TERMS_VERSION = "2026-10-24-draft-2";
export const CART_TERMS_VERSION = "square-zones-2026-10-24-draft-2";
export const DEADLINE_POLICY = "If the campaign is incomplete at its deadline, new reservations close while Inside914 reviews cancellation or revised dates. No charge occurs while the campaign is incomplete. Material changes to your billing agreement require your explicit agreement.";
export function consentText(amountCents: number) {
  return `I authorize Inside914 to securely save my payment method and charge ${formatPrice(amountCents)}, as shown in my reservation summary, only if the selected advertising campaign becomes fully reserved and Inside914 approves it for production. ${DEADLINE_POLICY}`;
}
export function cartConsentText(areas: {name:string;amount:number}[]) {
  const amounts=areas.map(a=>`${a.name}: ${formatPrice(a.amount)}`).join("; ");
  return `I authorize Inside914 to save my card for future off-session payments for these campaigns: ${amounts}. Each agreed amount is charged once only if that specific campaign fills and is approved for mailing. ${DEADLINE_POLICY} The combined maximum is ${formatPrice(areas.reduce((n,a)=>n+a.amount,0))}. This is not a recurring subscription. Nothing is charged today.`;
}
