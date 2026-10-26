import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_MARKETING_PATHS, PRIVATE_ROUTE_PREFIXES, SITE_URL, absoluteUrl, marketingMetadata, regionStructuredData } from "../src/lib/seo";
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
  it.each(["//outside.example/path", "https://outside.example", "/areas?token=secret", "/areas#private", "/\\outside.example"])("rejects noncanonical or parameterized SEO input %s", path => {
    expect(() => absoluteUrl(path)).toThrow();
  });
  it("includes exactly seven unique public pages without invented timestamps", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(sitemap()).toEqual(PUBLIC_MARKETING_PATHS.map(path => ({ url: absoluteUrl(path) })));
    expect(new Set(sitemap().map(item => item.url)).size).toBe(7);
    expect(sitemap().map(item => item.url)).toContain("https://inside914.com/contact");
    for (const { slug } of REGIONS) expect(sitemap().map(item => item.url)).toContain(absoluteUrl(`/areas/${slug}`));
    expect(sitemap().every(({ url }) => !/\/(admin|api|book|pay|reservation|r|account|legal)(\/|$)/.test(url))).toBe(true);
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
  it("regional schema connects the webpage, website and breadcrumb without invented business facts", () => {
    for (const region of REGIONS) {
      const [page, breadcrumb] = regionStructuredData(region.slug, region.name, REGION_CONTENT[region.slug].description);
      expect(page).toMatchObject({ "@type": "WebPage", url: `${SITE_URL}/areas/${region.slug}`, isPartOf: { "@id": `${SITE_URL}/#website` } });
      expect(breadcrumb.itemListElement?.map(item => item.position)).toEqual([1, 2, 3]);
      expect(page.breadcrumb?.["@id"]).toBe(breadcrumb["@id"]);
      expect(JSON.stringify([page, breadcrumb])).not.toMatch(/AggregateRating|LocalBusiness|streetAddress|latitude/);
    }
  });
  it("does not release checkout, collection or invitation emails", () => {
    expect(PUBLIC_CHECKOUT_RELEASED).toBe(false);
    expect(LIVE_COLLECTION_RELEASED).toBe(false);
    expect(INVITATION_EMAIL_RELEASED).toBe(false);
  });
});
