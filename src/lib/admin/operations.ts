// Display-only labels. Database and collection service remain the authorization boundary.
export function simplePaymentStatus(charge?: string, cancelled = false, ready = false, saved = false) {
  if (cancelled) return "Cancelled";
  if (charge === "succeeded") return "Paid";
  if (["requires_action", "requires_payment_method", "canceled"].includes(charge ?? "")) return "Needs attention";
  if (charge === "processing" || charge === "pending") return "Processing";
  if (ready) return "Ready";
  return saved ? "Card saved" : "Needs attention";
}
export function campaignOperationStatus(input: {status:string; paused:boolean; filled:number; approved:number; paid:number; issues:number; chargeReady:boolean; mailReady:boolean}) {
  if (["mailed", "completed"].includes(input.status)) return "Mailed";
  if (input.status === "cancelled") return "Cancelled";
  if (input.status === "draft") return "Draft";
  if (input.paused) return "Reservations paused";
  if (input.issues) return "Payment issues";
  if (input.mailReady) return "Ready to mail";
  if (input.paid === 10) return "Paid — final review needed";
  if (input.filled < 10) return input.filled ? `${input.filled} of 10 filled` : input.status === "open" ? "Open for reservations" : "Reservations closed";
  if (input.approved < 10) return "Full — artwork review needed";
  return input.chargeReady ? "Ready to charge" : "Full — final review needed";
}
