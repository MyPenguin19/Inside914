import type { Metadata } from "next";

// Public SEO URLs only. Never add private tokens, checkout sessions, or admin routes.
export const SITE_URL = "https://inside914.com";
export const SITE_NAME = "Inside914";
export const SEO_CONTACT_EMAIL = "Info@inside914.com";
export const PUBLIC_MARKETING_PATHS = ["/", "/areas", "/areas/central-westchester", "/areas/southern-westchester", "/areas/northern-westchester", "/areas/eastern-westchester"] as const;
export const PRIVATE_ROBOTS = { index: false, follow: false, noarchive: true } as const;
export const SOCIAL_IMAGE_ALT = "Inside914 — Westchester County shared postcard advertising";
export const PRIVATE_ROUTE_PREFIXES = ["admin", "account", "dashboard", "book", "reservation", "pay", "r", "api", "editions"] as const;

export function absoluteUrl(path = "/") {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\]/.test(path)) {
    throw new Error("SEO URLs must be unparameterized paths on the canonical host");
  }
  return new URL(path, SITE_URL).toString();
}

export function marketingMetadata(path: (typeof PUBLIC_MARKETING_PATHS)[number], title: string, description: string): Metadata {
  const brandedTitle = `${title} | ${SITE_NAME}`;
  const image = { url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: SOCIAL_IMAGE_ALT };
  return {
    // Absolute avoids the root template duplicating the brand, including on the homepage.
    title: { absolute: brandedTitle },
    description,
    alternates: { canonical: absoluteUrl(path) },
    openGraph: { type: "website", siteName: SITE_NAME, locale: "en_US", title: brandedTitle, description, url: absoluteUrl(path), images: [image] },
    twitter: { card: "summary_large_image", title: brandedTitle, description, images: [image] },
  };
}

export function regionStructuredData(slug: string, name: string, description: string) {
  const url = absoluteUrl(`/areas/${slug}`);
  const breadcrumbId = `${url}#breadcrumb`;
  return [
    { "@context": "https://schema.org", "@type": "WebPage", "@id": `${url}#webpage`, url, name, description,
      isPartOf: { "@id": `${SITE_URL}/#website` }, about: { "@id": `${SITE_URL}/#organization` }, breadcrumb: { "@id": breadcrumbId } },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", "@id": breadcrumbId,
      itemListElement: [{ name: "Home", item: absoluteUrl("/") }, { name: "Advertising areas", item: absoluteUrl("/areas") }, { name, item: url }]
        .map((item, index) => ({ "@type": "ListItem", position: index + 1, ...item })) },
  ];
}
