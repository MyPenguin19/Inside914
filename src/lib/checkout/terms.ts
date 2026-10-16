import { formatPrice } from "@/lib/format";

// DRAFT terms: must be reviewed for legal and card-network requirements before real payments.
// Bump TERMS_VERSION whenever the consent text or linked policies change; it's stored with each consent.
export const TERMS_VERSION = "2026-10-16-draft-1";

export function consentText(amountCents: number) {
  return `I authorize Inside914 to securely save my payment method and charge ${formatPrice(amountCents)}, as shown in my reservation summary, only if the selected advertising campaign becomes fully reserved and Inside914 approves it for production. If the campaign does not fill by its stated deadline, my reservation will be canceled without charge.`;
}
