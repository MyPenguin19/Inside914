import { execFileSync } from "node:child_process";
import { assertTestEnvironment } from "../../scripts/test-environment";

export default function setupLocalCatalog() {
  assertTestEnvironment();
  // The SQL runner has a fixed local connection. Require the API to be the same
  // local stack rather than silently preparing fixtures in a different database.
  const urls = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL].filter(Boolean);
  if (urls.some(url => !/^http:\/\/(127\.0\.0\.1|localhost):54321\/?$/.test(url!))) {
    throw new Error("Catalog fixtures require the isolated localhost:54321 Supabase stack");
  }
  execFileSync("python3", ["scripts/local-test-db.py", "-1", "-f", "tests/fixtures/legacy-catalog.sql"], { stdio: "pipe" });
}
