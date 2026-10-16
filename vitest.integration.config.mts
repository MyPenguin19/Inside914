import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests run against a Supabase project: the local stack (`npx supabase start`),
// or the dev project when SUPABASE_URL / SUPABASE_ANON_KEY are set.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
  },
});
