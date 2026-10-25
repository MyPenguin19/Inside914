import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  // Preview deployments and branch URLs must not compete with the production canonical host.
  if (process.env.VERCEL_ENV === "preview") return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    // HTML routes remain crawlable so engines can see their noindex directives.
    // Tokens, APIs and downloadable private evidence are not crawl destinations.
    // Authentication/authorization, not robots.txt, protects private data.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/r/", "/reservation/evidence/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
