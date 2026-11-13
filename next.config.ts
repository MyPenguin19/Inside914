import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security/headers";
import { PRIVATE_ROUTE_PREFIXES, PUBLIC_INDEXABLE_PATHS, absoluteUrl } from "./src/lib/seo";

const nextConfig: NextConfig = {
  // Project instructions live in CLAUDE.md; stop `next dev` from writing AGENTS.md.
  agentRules: false,
  cacheComponents: true,
  async redirects() {
    // Consolidate public copies on the old hosting alias. Preview deployment URLs
    // and private reservation/authentication routes keep their existing behavior.
    return PUBLIC_INDEXABLE_PATHS.map(path => ({
      source: path,
      has: [{ type: "host" as const, value: "inside914.vercel.app" }],
      destination: absoluteUrl(path),
      permanent: true,
    }));
  },
  async headers() {
    const options = {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      dev: process.env.NODE_ENV === "development",
      preview: process.env.VERCEL_ENV === "preview",
    };
    return [
      { source: "/:path*", headers: [...securityHeaders(options), ...(options.preview ? [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] : [])] },
      ...PRIVATE_ROUTE_PREFIXES.map(prefix => ({ source: `/${prefix}/:path*`, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] })),
      ...["/admin/artwork/:id/original", "/admin/campaigns/:id/originals"].map(source => ({ source, headers: [{ key: "Referrer-Policy", value: "no-referrer" }] })),
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
