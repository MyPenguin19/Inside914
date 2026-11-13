import type { MetadataRoute } from "next";
import { PUBLIC_INDEXABLE_PATHS, absoluteUrl } from "@/lib/seo";

// Only public, canonical marketing pages and current published policies belong here.
// Do not include draft policies, redirects, checkout flows, admin routes, or tokenized links.
export default function sitemap(): MetadataRoute.Sitemap {
  if (process.env.VERCEL_ENV === "preview") return [];
  return PUBLIC_INDEXABLE_PATHS.map((path) => ({
    url: absoluteUrl(path),
  }));
}
