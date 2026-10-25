import type { MetadataRoute } from "next";
import { PUBLIC_MARKETING_PATHS, absoluteUrl } from "@/lib/seo";

// Only genuinely public, canonical marketing pages belong here.
// Do not include draft policies, redirects, checkout flows, admin routes, or tokenized links.
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_MARKETING_PATHS.map((path) => ({
    url: absoluteUrl(path),
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/areas" ? 0.9 : 0.7,
  }));
}
