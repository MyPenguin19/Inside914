// Public support address shown on the site. Matches the SUPPORT_EMAIL default used in emails.
export const SUPPORT_EMAIL = "Info@inside914.com";
export const SUPPORT_PHONE = "914-879-5022";
export const SUPPORT_PHONE_HREF = "tel:+19148795022";

// Business address supplied by the owner. No street number or storefront hours were provided.
export const BUSINESS_ADDRESS = {
  streetAddress: "N State RD",
  addressLocality: "Briarcliff Manor",
  addressRegion: "NY",
  postalCode: "10510",
  addressCountry: "US",
} as const;
export const BUSINESS_ADDRESS_LABEL = `${BUSINESS_ADDRESS.streetAddress}, ${BUSINESS_ADDRESS.addressLocality}, ${BUSINESS_ADDRESS.addressRegion} ${BUSINESS_ADDRESS.postalCode}`;
