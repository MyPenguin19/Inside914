import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  // Preview deployments and branch URLs must not compete with the production canonical host.
  if (process.env.VERCEL_ENV === "preview") return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin/", "/account/", "/dashboard/", "/book/", "/reservation/", "/pay/", "/r/", "/editions/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
