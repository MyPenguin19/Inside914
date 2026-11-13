// Public editorial copy only. Actual campaign prices are resolved by lib/pricing.ts.
export const ADVERTISED_PRICE = 399;
export const ADVERTISED_PRICE_LABEL = `$${ADVERTISED_PRICE}`;

export const MARKETING_NAV = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/areas", label: "Advertising Areas" },
  { href: "/pricing", label: "Pricing" },
  { href: "/our-postcard", label: "Our Postcard" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

export const MARKETING_PAGES = {
  "/": { title: "Westchester Postcard Advertising", description: "Explore shared postcard advertising for Westchester County businesses. Compare four local areas, learn how reservations work and plan your next campaign." },
  "/how-it-works": { title: "How Shared Postcard Advertising Works", description: "Learn how Inside914 shared postcard campaigns work in Westchester: choose areas, select an ad position, upload artwork and reserve with nothing charged today." },
  "/areas": { title: "Westchester Advertising Areas", description: "Compare Central, Southern, Northern and Eastern Westchester advertising areas. Explore the map, proposed communities, campaign prices and postcard positions." },
  "/pricing": { title: "Postcard Advertising Pricing in Westchester", description: `Explore Inside914 postcard advertising at ${ADVERTISED_PRICE_LABEL} per area. Learn what a shared ad space includes, how multi-area reservations work and when payment is collected.` },
  "/our-postcard": { title: "Shared Postcard Layout & Sample Ads", description: "Flip through an Inside914 sample postcard. See six front ad spaces, four back spaces and the mailing panel, then plan artwork for your Westchester campaign." },
  "/faq": { title: "Westchester Postcard Advertising FAQ", description: "Get answers about Inside914 postcard advertising: reservations, payment timing, artwork changes, mailing areas and what happens when a campaign does not fill." },
  "/contact": { title: "Contact Us for Westchester Advertising", description: "Contact Inside914 about postcard advertising in Westchester County. Send a message, email Info@inside914.com or call 914-879-5022 to get in touch." },
} as const;

export const CAMPAIGN_STEPS = [
  { title: "Choose your areas", body: "Pick one or more areas on the map.", detail: "Compare Central, Southern, Northern and Eastern Westchester with the places your business serves. Review each available campaign’s price and details before selecting it. Each area runs as a separate campaign." },
  { title: "Choose positions and artwork", body: "Pick a position and add your image. Use the same image or a different one in each area.", detail: "Choose an available position on the front or back of the postcard. Upload your ad, preview the crop and check that your business name, offer and contact information are easy to read." },
  { title: "Add your business details", body: "Tell us your business name and how to reach you.", detail: "Provide the business and contact details for your reservation. Review the selected areas, artwork and agreed prices together so the reservation reflects the campaign you want." },
  { title: "Reserve securely", body: "Save your card. Pay $0 today, then the agreed price per area when its postcard fills and is approved.", detail: "Your card is saved securely during reservation. Payment is collected for an area only after that campaign fills and receives the required approval. Your confirmation email includes a private link to follow your reservation." },
] as const;

export const ADVERTISING_FAQ = [
  { q: "How does shared mail work?", a: "Multiple local businesses share one professionally printed postcard mailed within a selected Westchester area. Each campaign has 10 paid advertising spaces. Choose one or multiple areas, with a separate position and artwork for each." },
  { q: "When am I charged?", a: "Nothing is charged when you reserve. Your card is saved securely. Each selected area is independent: you are charged the agreed price for an area only after that campaign fills and is approved." },
  { q: "What if the postcard doesn't fill?", a: "You are not charged for an area unless its campaign fills and is approved. If it isn't fully reserved by its deadline, new reservations close while Inside914 reviews cancellation or revised dates. Other selected areas are handled independently." },
  { q: "What happens after I reserve?", a: "You receive a confirmation email with a private link to your reservation. Each area moves from reservation to artwork review, a filled campaign, final preparation, payment, and mailing. Follow progress on your private campaign page." },
  { q: "Can I change my artwork?", a: "Yes. Before reserving, you can replace or adjust your artwork. After reserving, contact us for help with changes before the applicable artwork deadline and final approval or production lock." },
  { q: "Can I advertise in more than one area?", a: "Yes. Choose one or more available areas. Each has its own position, artwork, agreed price and campaign status. You can use the same artwork across areas or tailor it to each one." },
  { q: "Where will the postcard be mailed?", a: "Inside914 organizes campaigns into Central, Southern, Northern and Eastern Westchester. The map and community guides show proposed groupings. Final postal routes, household quantities and mailing dates are confirmed for the individual campaign; an area name does not mean every address in that region receives a postcard." },
  { q: "How many advertising spaces are on the postcard?", a: "The shared layout has 10 paid advertising spaces: six on the front and four on the back. The back also includes an Inside914 panel and a reserved mailing panel. The interactive sample shows how these parts fit together." },
  { q: "Does the sample card show actual advertisers?", a: "The sample uses illustrative business names and artwork to explain the layout. It does not show live availability or a final campaign proof. Use the advertising areas page to see available campaign positions." },
] as const;
