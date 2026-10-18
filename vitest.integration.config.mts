import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests run ONLY against the local Supabase stack (`npx supabase start`); the setup
// file refuses any hosted project, which is production.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup-env.ts"],
    testTimeout: 30_000, // real network calls to Supabase
    fileParallelism: false, // files share one database and clean it up; run them one at a time
  },
});
