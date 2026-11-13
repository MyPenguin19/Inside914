// Public explanations of the existing reservation agreement. They do not replace
// versioned checkout consent or change the terms attached to earlier reservations.
export const POLICY_LINKS = [
  { slug: "terms", label: "Advertising terms", title: "Advertising Terms", description: "Read the Inside914 advertising terms for shared postcard campaigns in Westchester County, including advertiser responsibilities, artwork and payment conditions." },
  { slug: "reservation-policy", label: "Reservation policy", title: "Reservation and Cancellation Policy", description: "Review Inside914 reservation and cancellation terms, including campaign approval, payment timing, artwork deadlines and how selected areas are handled." },
  { slug: "payment-authorization", label: "Payment authorization", title: "Reservation and Payment Authorization", description: "Understand Inside914 payment authorization: no charge at reservation, conditions for future collection, separate campaign limits and how to request cancellation." },
  { slug: "cancellation-policy", label: "Cancellation and refunds", title: "Cancellation and Refund Policy", description: "Learn how to request an Inside914 cancellation and how refunds depend on payment, printer commitment, artwork approval and the status of each campaign." },
  { slug: "privacy", label: "Privacy policy", title: "Privacy Policy", description: "Read how Inside914 handles business contact information, reservation details, artwork and website analytics for its Westchester postcard advertising service." },
] as const;

export type PolicyDocument = {
  title: string;
  intro?: string;
  sections: { heading: string; blocks: { type: string; text?: string; items?: string[] }[] }[];
};

export const POLICY_SUMMARIES: Record<string, PolicyDocument> = {
  "payment-authorization": {
    title: "Reservation and Payment Authorization",
    intro: "This page explains the authorization you accept when confirming a reservation. Your reservation summary and the terms you accepted set the amount and conditions for each campaign. This explanation does not change an existing authorization.",
    sections: [
      { heading: "1. No charge at reservation", blocks: [{ type: "paragraph", text: "You pay $0 when you reserve. Your payment method is saved securely through Stripe for a possible future charge by Inside Diagnostics LLC, operating Inside914. This is a one-time advertising purchase, not a subscription or recurring payment." }] },
      { heading: "2. Conditions required before any charge", blocks: [{ type: "paragraph", text: "A campaign may be charged only when all applicable conditions are met:" }, { type: "list", items: [
        "All ten advertising positions in that campaign have confirmed reservations.",
        "The required artwork and final production proof have been approved.",
        "Your reservation remains active and the related payment authorization is valid.",
        "Qualifying cancellation requests or authorization issues have been reviewed and resolved.",
        "The charge does not exceed the amount you accepted for that campaign.",
        "Inside914 has explicitly approved payment collection for that campaign.",
      ] }] },
      { heading: "3. Multi-area reservations", blocks: [{ type: "paragraph", text: "Each selected area is a separate campaign with its own agreed maximum amount. A campaign filling does not authorize a charge for another campaign that remains incomplete. The combined charges cannot exceed the total you accepted, and no individual campaign charge can exceed its accepted price." }] },
      { heading: "4. Amount and changes", blocks: [{ type: "paragraph", text: "The authorized amount appears in your reservation summary and confirmation. Original prices, deadlines and consent records are preserved. A material revised deadline or payment condition requiring renewed agreement must be separately accepted; it does not silently expand your authorization." }] },
      { heading: "5. Failed payments", blocks: [{ type: "paragraph", text: "A failed payment does not count as payment for your campaign. Review your private reservation page or contact Info@inside914.com for help with your payment status. Any further collection must remain within the amount and conditions you authorized." }] },
      { heading: "6. Revoking authorization or requesting cancellation", blocks: [{ type: "paragraph", text: "Request cancellation through your private reservation page or by emailing Info@inside914.com. Include your reservation reference, business name and the affected campaign. Qualifying requests that affect authorization must be reviewed before collection proceeds. A canceled, uncharged reservation cannot later be charged under its canceled authorization." }, { type: "paragraph", text: "If a payment has already been collected, cancellation and refund eligibility depend on the accepted terms and the payment and printer-order status. Contact us if you believe a charge was not authorized." }] },
      { heading: "7. Records", blocks: [{ type: "paragraph", text: "Inside914 retains the authorization text, accepted amount and reservation records associated with your agreement, together with payment-attempt records. These records help verify what was authorized and review payment questions." }] },
    ],
  },
  "cancellation-policy": {
    title: "Cancellation and Refund Policy",
    intro: "Nothing is charged at reservation. This guide explains how cancellation and refund requests are handled at each stage, subject to the reservation terms you accepted. Each area in a multi-area reservation is considered separately.",
    sections: [
      { heading: "1. Canceling before payment", blocks: [{ type: "paragraph", text: "Request cancellation from your private reservation page or by contacting Info@inside914.com. A timely request received before payment collection and irreversible production commitment may be resolved without an advertising fee, as described in the reservation policy. Inside914 reviews the request and records the outcome. An approved cancellation prevents collection under that canceled authorization." }] },
      { heading: "2. If a campaign does not fill", blocks: [{ type: "paragraph", text: "An incomplete campaign cannot be charged. At its reservation deadline it closes to new reservations while Inside914 reviews cancellation or a revised deadline. A revised deadline does not silently extend your agreement. If the campaign is canceled before payment, no advertising fee is charged for that campaign." }] },
      { heading: "3. If a campaign is canceled after payment", blocks: [{ type: "paragraph", text: "If Inside914 cancels a campaign or cannot provide the agreed mailing service, amounts collected for the unfulfilled campaign are eligible for a full refund. You may instead accept a documented replacement mailing; a replacement is not imposed without your agreement." }, { type: "paragraph", text: "Approved refunds are returned to the original payment method where supported. The reservation policy describes the proposed processing standard, and your bank or payment processor may take additional time to post the credit." }] },
      { heading: "4. Artwork that cannot be approved", blocks: [{ type: "paragraph", text: "Inside914 may request corrected or replacement artwork and provides a reasonable correction opportunity when feasible before the artwork deadline. If acceptable artwork cannot be obtained and the campaign cannot proceed before payment, the affected reservation may be canceled without charge. If payment has occurred but production has not been committed, a full refund is available where the campaign cannot proceed." }] },
      { heading: "5. Customer cancellation after payment", blocks: [{ type: "paragraph", text: "If payment has been collected but the associated printer order has not been irrevocably committed, an eligible customer-requested cancellation receives a full refund of the advertising charge for that campaign. Payment and printer-order status must be verified first." }, { type: "paragraph", text: "After the printer order has been accepted and committed, production or mailing costs may no longer be recoverable. Voluntary cancellation does not automatically guarantee a refund. Inside914 reviews actual costs, service status and the accepted agreement. This does not remove remedies for failure to deliver the agreed service or rights that cannot lawfully be waived." }] },
      { heading: "6. How to request a cancellation", blocks: [{ type: "list", items: ["Use the change or cancellation request option on your private reservation page, or email Info@inside914.com.", "Include your reservation reference, business name, the affected area or campaign, and what you would like changed.", "Check your reservation status and follow up with us if you have not received a response."] }, { type: "paragraph", text: "Submitting a request does not automatically reverse a payment or cancel a committed printer order. Qualifying requests affecting authorization or production must be reviewed before the affected action proceeds. Historical reservations remain governed by their originally accepted terms unless an appropriate new agreement is obtained." }] },
    ],
  },
};
