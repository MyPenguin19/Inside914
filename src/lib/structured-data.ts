import { SITE_URL, SITE_NAME, absoluteUrl } from "./seo";
import { BUSINESS_ADDRESS, SUPPORT_EMAIL, SUPPORT_PHONE_HREF } from "./support";
import { ADVERTISED_PRICE, ADVERTISING_FAQ } from "./marketing-content";

export function regionStructuredData(slug: string, name: string, description: string) {
  return pageStructuredData(`/areas/${slug}`, name, description, { parent: { name: "Advertising areas", path: "/areas" } });
}

const organization = {
  "@context": "https://schema.org", "@type": "Organization", "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME, legalName: "Inside Diagnostics LLC", url: absoluteUrl("/"),
  logo: { "@type": "ImageObject", url: absoluteUrl("/brand-logo"), width: 600, height: 240 },
  email: SUPPORT_EMAIL, telephone: SUPPORT_PHONE_HREF.replace("tel:", ""),
  address: { "@type": "PostalAddress", ...BUSINESS_ADDRESS },
  description: "Inside914 provides shared postcard advertising for local businesses in Westchester County, New York.",
  areaServed: { "@type": "AdministrativeArea", name: "Westchester County, New York" },
};
const website = {
  "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITE_URL}/#website`,
  url: absoluteUrl("/"), name: SITE_NAME, inLanguage: "en-US", publisher: { "@id": organization["@id"] },
};

export const postcardService = {
  "@context": "https://schema.org", "@type": "Service", "@id": `${SITE_URL}/#postcard-service`,
  name: "Shared postcard advertising", serviceType: "Postcard advertising", url: absoluteUrl("/pricing"),
  description: "One advertising space on a shared postcard mailed within your selected Westchester area.",
  provider: { "@id": organization["@id"] }, areaServed: organization.areaServed,
  offers: { "@type": "Offer", url: absoluteUrl("/pricing"), price: ADVERTISED_PRICE, priceCurrency: "USD",
    description: "Advertised price per area. Review the selected campaign’s agreed price before reserving. Nothing is charged at reservation." },
};

export const faqQuestions = ADVERTISING_FAQ.map(({ q, a }) => ({
  "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a },
}));

export function pageStructuredData(path: string, name: string, description: string, options: {
  type?: "WebPage" | "ContactPage" | "AboutPage" | "CollectionPage" | "FAQPage";
  parent?: { name: string; path: string };
  mainEntity?: Record<string, unknown> | readonly Record<string, unknown>[];
  entities?: readonly Record<string, unknown>[];
} = {}) {
  const url = absoluteUrl(path);
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`,
    itemListElement: [
      { name: "Home", item: absoluteUrl("/") },
      ...(options.parent ? [{ name: options.parent.name, item: absoluteUrl(options.parent.path) }] : []),
      { name, item: url },
    ].map((item, index) => ({ "@type": "ListItem", position: index + 1, ...item })),
  };
  return [
    { "@context": "https://schema.org", "@type": options.type ?? "WebPage", "@id": `${url}#webpage`,
      url, name, description, inLanguage: "en-US", isPartOf: { "@id": website["@id"] }, about: { "@id": organization["@id"] },
      ...(path !== "/" ? { breadcrumb: { "@id": breadcrumb["@id"] } } : {}),
      ...(options.mainEntity ? { mainEntity: options.mainEntity } : {}),
    },
    ...(path !== "/" ? [breadcrumb] : []), organization, website, ...(options.entities ?? []),
  ];
}
