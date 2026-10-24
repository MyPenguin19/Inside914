export function reservationTimeline(input:{confirmed:boolean;artworkApproved:boolean;filled:boolean;paymentStatus:string;paymentIsTest:boolean;editionStatus:string;kinds:string[]}) {
 const has=(kind:string)=>input.kinds.includes(kind);
 return [
  {label:"Reservation confirmed",complete:input.confirmed},
  {label:"Artwork approved",complete:input.artworkApproved},
  {label:"Campaign filled",complete:input.filled},
  {label:"Payment completed",complete:input.paymentStatus==="succeeded"&&!input.paymentIsTest},
  {label:"Sent to printer",complete:has("printer_confirmation")},
  {label:"Mailing accepted",complete:has("postal_acceptance")},
  {label:"Campaign completed",complete:has("mailing_confirmation")&&["mailed","completed"].includes(input.editionStatus)},
 ];
}
export const CUSTOMER_PAYMENT_LABELS:Record<string,string>={unverified:"A payment history requires verification. Contact Inside914 for its current status.",test_payment:"Test payment record only; no live payment is recorded here.",not_collected:"No payment collected.",succeeded:"Payment completed.",processing:"Payment is processing.",requires_action:"Payment needs your attention. Use the secure payment email or contact Inside914.",requires_payment_method:"Payment was not completed. Contact Inside914 for help.",canceled:"Payment attempt canceled."};

// A missing ledger is not evidence that a historically charged reservation was unpaid.
export function customerPaymentStatus(bookingStatus:string,ledger:{status:string;stripe_mode:string|null}|null) {
 if(ledger?.stripe_mode==="test")return "test_payment";
 if(ledger?.status==="succeeded"&&ledger.stripe_mode!=="live")return "unverified";
 if(ledger)return ledger.status;
 return ["charged","charge_failed"].includes(bookingStatus)?"unverified":"not_collected";
}
