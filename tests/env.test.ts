import { afterEach, describe, expect, test, vi } from "vitest";

// `server-only` throws outside the React Server environment; the guard itself is checked by the build.
vi.mock("server-only", () => ({}));

const { getPublicEnv } = await import("@/lib/env/public");
const { getServerEnv } = await import("@/lib/env/server");

const URL_OK = "https://abcdefghijklmnop.supabase.co";
const PUBLISHABLE = "sb_publishable_test_123";
const SECRET = "sb_secret_test_456";

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

afterEach(() => vi.unstubAllEnvs());

describe("getPublicEnv", () => {
  test("returns the public Supabase settings", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE });
    expect(getPublicEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: URL_OK,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
    });
  });

  test("names every missing variable", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined });
    expect(() => getPublicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  test("rejects a URL that is not a URL", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: "abcdefghijklmnop", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE });
    expect(() => getPublicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL: must be the project URL/);
  });

  test("refuses a secret key in the public variable, without echoing it", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SECRET });
    expect(() => getPublicEnv()).toThrow(/is a SECRET key/);
    try {
      getPublicEnv();
    } catch (error) {
      expect(String(error)).not.toContain(SECRET);
    }
  });
});

describe("getServerEnv", () => {
  test("returns public settings plus the secret key", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE, SUPABASE_SECRET_KEY: SECRET });
    expect(getServerEnv().SUPABASE_SECRET_KEY).toBe(SECRET);
  });

  test("explains a missing secret key", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE, SUPABASE_SECRET_KEY: undefined });
    expect(() => getServerEnv()).toThrow(/SUPABASE_SECRET_KEY: is required/);
  });

  test("rejects the publishable key used as the secret key", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE, SUPABASE_SECRET_KEY: PUBLISHABLE });
    expect(() => getServerEnv()).toThrow(/SUPABASE_SECRET_KEY/);
  });

  test("accepts a legacy service_role JWT", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE, SUPABASE_SECRET_KEY: "aaa.bbb.ccc" });
    expect(getServerEnv().SUPABASE_SECRET_KEY).toBe("aaa.bbb.ccc");
  });
});
