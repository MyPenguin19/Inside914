import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// The runner hardcodes localhost:54322. Each SQL suite wraps all mutations in ROLLBACK.
for (const file of ["square-product", "shared-artwork", "four-zone-readiness", "zone-payments", "campaign-management"]) {
  test(`square MVP database invariants: ${file}`, () => {
    const output = execFileSync("python3", ["scripts/local-test-db.py", "-f", `tests/database/${file}.sql`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(output.trim()).toMatch(/ROLLBACK$/);
  });
}

test("custom campaign amounts retain all collection, webhook, recovery and archive safeguards", () => {
  const sql = readFileSync("tests/database/zone-payments.sql", "utf8").replaceAll("39900", "44900");
  const output = execFileSync("python3", ["scripts/local-test-db.py", "-f", "-"], {input:sql,encoding:"utf8",stdio:["pipe","pipe","pipe"]});
  expect(output.trim()).toMatch(/ROLLBACK$/);
});
