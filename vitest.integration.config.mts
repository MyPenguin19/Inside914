import { defineConfig } from "vitest/config";

// Integration tests run against the local Supabase stack (`npx supabase start`).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
  },
});
