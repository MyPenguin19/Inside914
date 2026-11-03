import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import setupLocalCatalog from "./fixtures/setup-local-catalog";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.mocked(execFileSync).mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("local catalog fixture boundary", () => {
  test.each(["https://example.supabase.co", "http://localhost:54331"])("rejects a mismatched API %s before running SQL", url => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    expect(() => setupLocalCatalog()).toThrow();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  test("rejects live credentials before running SQL", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fixture");
    expect(() => setupLocalCatalog()).toThrow("live Stripe");
    expect(execFileSync).not.toHaveBeenCalled();
  });

  test("uses only the fixed local runner and transaction-wrapped fixture file", () => {
    setupLocalCatalog();
    expect(execFileSync).toHaveBeenCalledExactlyOnceWith("python3", ["scripts/local-test-db.py", "-1", "-f", "tests/fixtures/legacy-catalog.sql"], { stdio: "pipe" });
  });
});
