import { afterEach, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BookingLayout, { metadata } from "../src/app/book/layout";

vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }));
afterEach(() => vi.unstubAllEnvs());

test("production booking layout hides checkout children and remains noindex", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  const html = renderToStaticMarkup(<BookingLayout><div>private-checkout-form</div></BookingLayout>);
  expect(html).toContain("Reservations are not open yet.");
  expect(html).not.toContain("private-checkout-form");
  expect(metadata.robots.index).toBe(false);
});

test("isolated local fixtures retain their existing checkout access", () => {
  vi.stubEnv("VERCEL_ENV", ""); vi.stubEnv("VERCEL", "");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("INSIDE914_DEV_TEST_RESERVATIONS", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  expect(renderToStaticMarkup(<BookingLayout><div>local-fixture-form</div></BookingLayout>)).toBe("<div>local-fixture-form</div>");
});
