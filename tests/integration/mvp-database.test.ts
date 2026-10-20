import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";

// The runner hardcodes localhost:54322. Each SQL suite wraps all mutations in ROLLBACK.
for (const file of ["square-product", "shared-artwork", "four-zone-readiness"]) {
  test(`square MVP database invariants: ${file}`, () => {
    const output = execFileSync("python3", ["scripts/local-test-db.py", "-f", `tests/database/${file}.sql`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(output.trim()).toMatch(/ROLLBACK$/);
  });
}
