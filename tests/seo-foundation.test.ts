import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_MARKETING_PATHS, PUBLIC_INDEXABLE_PATHS, PUBLIC_POLICY_PATHS, PRIVATE_ROUTE_PREFIXES, SITE_URL, absoluteUrl, marketingMetadata } from "../src/lib/seo";
import { pageStructuredData, regionStructuredData, postcardService, faqQuestions } from "../src/lib/structured-data";
import { MARKETING_NAV, MARKETING_PAGES, ADVERTISING_FAQ, ADVERTISED_PRICE } from "../src/lib/marketing-content";
import { REGION_CONTENT } from "../src/lib/seo-regions";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";
import config from "../next.config";
import { REGIONS } from "../src/lib/catalog/regions";
import { PUBLIC_CHECKOUT_RELEASED } from "../src/lib/checkout/release";
import { LIVE_COLLECTION_RELEASED } from "../src/lib/payments/environment";
import { INVITATION_EMAIL_RELEASED } from "../src/lib/invitations/release";

afterEach(() => vi.unstubAllEnvs());

describe("public SEO and indexing boundaries", () => {
  it("uses one HTTPS canonical host", () => {
    expect(SITE_URL).toBe("https://inside914.com");
    expect(absoluteUrl("/areas")).toBe(`${SITE_URL}/areas`);
  });
  it("permanently redirects public legacy-host pages to the canonical host", async () => {
    expect(await config.redirects!()).toEqual(PUBLIC_INDEXABLE_PATHS.map(path => ({
      source: path, has: [{ type: "host", value: "inside914.vercel.app" }], destination: absoluteUrl(path), permanent: true,
    })));
  });
  it.each(["//outside.example/path", "https://outside.example", "/areas?token=secret", "/areas#private", "/\\outside.example"])("rejects noncanonical or parameterized SEO input %s", path => {
    expect(() => absoluteUrl(path)).toThrow();
  });
  it("includes sixteen unique public pages and published policies without invented timestamps", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(sitemap()).toEqual(PUBLIC_INDEXABLE_PATHS.map(path => ({ url: absoluteUrl(path) })));
    expect(new Set(sitemap().map(item => item.url)).size).toBe(16);
    expect(PUBLIC_POLICY_PATHS).toHaveLength(5);
    expect(sitemap().map(item => item.url)).toContain("https://inside914.com/contact");
    for (const { slug } of REGIONS) expect(sitemap().map(item => item.url)).toContain(absoluteUrl(`/areas/${slug}`));
    expect(sitemap().every(({ url }) => !/\/(admin|api|book|pay|reservation|r|account|dashboard|editions)(\/|$)/.test(url))).toBe(true);
  });
  it("allows public marketing and HTML noindex inspection; blocks API/token crawling", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(robots()).toEqual({ rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/r/", "/reservation/evidence/"] }], sitemap: `${SITE_URL}/sitemap.xml` });
  });
  it("previews have no sitemap entries and disallow crawling", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(sitemap()).toEqual([]);
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
    const headers = await config.headers!();
    expect(headers.find(rule => rule.source === "/:path*")?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" });
  });
  it("private prefixes have response-level noindex, including bare and nested paths", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const headers = await config.headers!();
    for (const prefix of PRIVATE_ROUTE_PREFIXES) {
      expect(headers.find(rule => rule.source === `/${prefix}/:path*`)?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" });
    }
    expect(headers.find(rule => rule.source === "/:path*")?.headers.some(header => header.key === "X-Robots-Tag")).toBe(false);
  });
  it("regional metadata and guidance are distinct and use canonical social URLs", () => {
    const descriptions = new Set<string>();
    const titles = new Set<string>();
    for (const region of REGIONS) {
      const copy = REGION_CONTENT[region.slug];
      const path = `/areas/${region.slug}` as const;
      const metadata = marketingMetadata(path, copy.title, copy.description);
      expect(metadata.title).toEqual({ absolute: `${copy.title} | Inside914` });
      expect(metadata.alternates?.canonical).toBe(absoluteUrl(path));
      expect(metadata.openGraph).toMatchObject({ url: absoluteUrl(path), images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }] });
      expect(metadata.twitter).toMatchObject({ card: "summary_large_image", description: copy.description });
      expect(copy.tips).toHaveLength(3);
      descriptions.add(copy.description); titles.add(copy.title);
    }
    expect(descriptions.size).toBe(4); expect(titles.size).toBe(4);
  });
  it("every menu entry is a dedicated, canonical marketing page", () => {
    for (const { href } of MARKETING_NAV) {
      expect(href).not.toMatch(/[?#]/);
      expect(PUBLIC_MARKETING_PATHS).toContain(href);
      expect(MARKETING_PAGES[href].description.length).toBeGreaterThan(100);
    }
    expect(new Set(Object.values(MARKETING_PAGES).map(page => page.title)).size).toBe(Object.keys(MARKETING_PAGES).length);
    expect(new Set(Object.values(MARKETING_PAGES).map(page => page.description)).size).toBe(Object.keys(MARKETING_PAGES).length);
  });
  it("regional schema connects the webpage, website and breadcrumb without invented business facts", () => {
    for (const region of REGIONS) {
      const graph = regionStructuredData(region.slug, region.name, REGION_CONTENT[region.slug].description);
      expect(graph).toContainEqual(expect.objectContaining({ "@type": "WebPage", url: `${SITE_URL}/areas/${region.slug}`, isPartOf: { "@id": `${SITE_URL}/#website` } }));
      expect(graph).toContainEqual(expect.objectContaining({ "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Advertising areas", item: `${SITE_URL}/areas` },
        { "@type": "ListItem", position: 3, name: region.name, item: `${SITE_URL}/areas/${region.slug}` },
      ] }));
      expect(JSON.stringify(graph)).not.toMatch(/AggregateRating|LocalBusiness|streetAddress|latitude/);
    }
  });
  it("uses published contact details and a crawlable logo for the organization", () => {
    const graph = pageStructuredData("/contact", "Contact", "Contact Inside914", { type: "ContactPage" });
    expect(graph).toContainEqual(expect.objectContaining({ "@type": "Organization", legalName: "Inside Diagnostics LLC", telephone: "+19148795022", email: "Info@inside914.com", logo: { "@type": "ImageObject", url: `${SITE_URL}/brand-logo`, width: 600, height: 240 } }));
    expect(graph).toContainEqual(expect.objectContaining({ "@type": "ContactPage", breadcrumb: { "@id": `${SITE_URL}/contact#breadcrumb` } }));
  });
  it("describes the advertised service price and FAQ from the displayed copy", () => {
    expect(postcardService.offers).toMatchObject({ "@type": "Offer", price: ADVERTISED_PRICE, priceCurrency: "USD", url: `${SITE_URL}/pricing` });
    expect(postcardService).not.toHaveProperty("aggregateRating");
    expect(postcardService.offers).not.toHaveProperty("availability");
    expect(faqQuestions).toEqual(ADVERTISING_FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })));
  });
  it("approved reservations remain separate from collection and invitation emails", () => {
    expect(PUBLIC_CHECKOUT_RELEASED).toBe(true);
    expect(LIVE_COLLECTION_RELEASED).toBe(false);
    expect(INVITATION_EMAIL_RELEASED).toBe(false);
  });
});
