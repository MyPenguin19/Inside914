import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { clientAddress, holdAttemptLimit, visitorHash } = await import("@/lib/booking/hold-rate-limit");

afterEach(() => vi.unstubAllEnvs());

describe("hold rate limit helpers", () => {
  test("uses the first forwarded address, then x-real-ip", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientAddress(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientAddress(new Headers())).toBe("unknown");
  });

  test("hashes the address with a secret; never returns the address itself", () => {
    const hash = visitorHash("203.0.113.7", "secret-a");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203.0.113.7");
    expect(visitorHash("203.0.113.7", "secret-b")).not.toBe(hash); // keyed: can't be precomputed without the secret
  });

  test("defaults to 10 per 10 minutes; configuration can raise it but never lower or disable it", () => {
    expect(holdAttemptLimit()).toEqual({ max: 10, windowSeconds: 600 });
    vi.stubEnv("INSIDE914_HOLD_ATTEMPTS_MAX", "1000");
    expect(holdAttemptLimit().max).toBe(1000);
    for (const value of ["0", "-1", "3", "abc", "Infinity"]) {
      vi.stubEnv("INSIDE914_HOLD_ATTEMPTS_MAX", value);
      expect(holdAttemptLimit().max).toBe(10);
    }
  });
});
