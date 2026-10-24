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
export const CUSTOMER_PAYMENT_LABELS:Record<string,string>={not_collected:"No payment collected.",succeeded:"Payment completed.",processing:"Payment is processing.",requires_action:"Payment needs your attention. Use the secure payment email or contact Inside914.",requires_payment_method:"Payment was not completed. Contact Inside914 for help.",canceled:"Payment attempt canceled."};
