import { describe, expect, it } from "vitest";
import { PUBLIC_MARKETING_PATHS, SITE_URL, absoluteUrl } from "../src/lib/seo";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";
import { REGIONS } from "../src/lib/catalog/regions";

describe("public SEO and crawler configuration", () => {
  it("uses one HTTPS canonical host", () => {
    expect(SITE_URL).toBe("https://inside914.vercel.app");
    expect(absoluteUrl("/areas")).toBe("https://inside914.vercel.app/areas");
  });
  it("includes every public area page and excludes private routes", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toEqual(PUBLIC_MARKETING_PATHS.map((path) => absoluteUrl(path)));
    for (const { slug } of REGIONS) expect(urls).toContain(absoluteUrl(`/areas/${slug}`));
    expect(urls.every((url) => !/\/(admin|api|book|pay|reservation|r|account|legal)\//.test(url))).toBe(true);
  });
  it("does not place sensitive routes in the public sitemap", () => {
    const rules = robots().rules;
    expect(rules).toBeDefined();
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
