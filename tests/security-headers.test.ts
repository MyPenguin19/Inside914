import { describe, expect, test } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security/headers";

const SUPABASE = "https://abcdefghijklmnopqrst.supabase.co";
const directives = (csp: string) => new Map(csp.split(";").map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));

describe("content security policy", () => {
  const csp = directives(contentSecurityPolicy({ supabaseUrl: SUPABASE, dev: false, preview: false }));

  test("can't be framed and blocks plugins, base and form hijacking", () => {
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    expect(csp.has("upgrade-insecure-requests")).toBe(true);
  });

  test("allows Stripe's card form and Supabase uploads and images", () => {
    expect(csp.get("script-src")).toEqual(expect.arrayContaining(["'self'", "https://js.stripe.com", "https://*.js.stripe.com"]));
    expect(csp.get("frame-src")).toEqual(expect.arrayContaining(["https://js.stripe.com", "https://*.js.stripe.com", "https://hooks.stripe.com"]));
    expect(csp.get("connect-src")).toEqual(expect.arrayContaining(["'self'", "https://api.stripe.com", SUPABASE]));
    expect(csp.get("img-src")).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", SUPABASE]));
  });

  test("production never allows eval or any wildcard source", () => {
    expect(csp.get("script-src")).not.toContain("'unsafe-eval'");
    for (const values of csp.values()) expect(values).not.toContain("*");
  });

  test("dev adds eval (React's debugging needs it) and drops the https upgrade for localhost", () => {
    const dev = directives(contentSecurityPolicy({ supabaseUrl: "http://127.0.0.1:54321", dev: true, preview: false }));
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(dev.has("upgrade-insecure-requests")).toBe(false);
    expect(dev.get("connect-src")).toContain("http://127.0.0.1:54321");
  });

  test("previews allow the Vercel toolbar; production doesn't", () => {
    const preview = directives(contentSecurityPolicy({ supabaseUrl: SUPABASE, dev: false, preview: true }));
    expect(preview.get("script-src")).toContain("https://vercel.live");
    expect(csp.get("script-src")).not.toContain("https://vercel.live");
  });

  test("a missing or invalid Supabase URL is left out rather than breaking the policy", () => {
    const none = directives(contentSecurityPolicy({ supabaseUrl: undefined, dev: false, preview: false }));
    expect(none.get("connect-src")).toEqual(expect.arrayContaining(["'self'", "https://api.stripe.com"]));
    expect(contentSecurityPolicy({ supabaseUrl: "not a url", dev: false, preview: false })).not.toContain("not a url");
  });
});

describe("security headers", () => {
  const headers = new Map(securityHeaders({ supabaseUrl: SUPABASE, dev: false, preview: false }).map((h) => [h.key, h.value]));

  test("enforces framing, sniffing, referrer and permissions rules; CSP starts report-only", () => {
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toMatch(/camera=\(\)/);
    expect(headers.get("Permissions-Policy")).toMatch(/payment=\(self "https:\/\/js\.stripe\.com"/);
    expect(headers.get("Strict-Transport-Security")).toMatch(/max-age=\d+/);
    expect(headers.get("Content-Security-Policy-Report-Only")).toMatch(/frame-ancestors 'none'/);
    expect(headers.has("Content-Security-Policy")).toBe(false);
  });

  test("no HSTS in development (localhost is plain http)", () => {
    const dev = securityHeaders({ supabaseUrl: SUPABASE, dev: true, preview: false });
    expect(dev.some((h) => h.key === "Strict-Transport-Security")).toBe(false);
  });
});
