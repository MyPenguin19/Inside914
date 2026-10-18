import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  // Project instructions live in CLAUDE.md; stop `next dev` from writing AGENTS.md.
  agentRules: false,
  cacheComponents: true,
  async headers() {
    const options = {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      dev: process.env.NODE_ENV === "development",
      preview: process.env.VERCEL_ENV === "preview",
    };
    return [{ source: "/:path*", headers: securityHeaders(options) }];
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
