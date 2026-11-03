import { afterEach, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BookingLayout, { metadata } from "../src/app/book/layout";
import * as release from "@/lib/checkout/release";

vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

test("approved production reservations render checkout and remain noindex", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  const html = renderToStaticMarkup(<BookingLayout><div>private-checkout-form</div></BookingLayout>);
  expect(html).not.toContain("Reservations are not open yet.");
  expect(html).toContain("private-checkout-form");
  expect(metadata.robots.index).toBe(false);
});

test("the layout hides checkout if the server release is withdrawn", () => {
  vi.spyOn(release, "checkoutReleased").mockReturnValue(false);
  const html = renderToStaticMarkup(<BookingLayout><div>private-checkout-form</div></BookingLayout>);
  expect(html).toContain("Reservations are not open yet.");
  expect(html).not.toContain("private-checkout-form");
});

test("isolated local fixtures retain their existing checkout access", () => {
  vi.stubEnv("VERCEL_ENV", ""); vi.stubEnv("VERCEL", "");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("INSIDE914_DEV_TEST_RESERVATIONS", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  expect(renderToStaticMarkup(<BookingLayout><div>local-fixture-form</div></BookingLayout>)).toBe("<div>local-fixture-form</div>");
});
