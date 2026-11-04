import { afterEach, expect, test, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/booking/category-checkout", () => ({ categoryCatalog: async () => ({ editions: [] }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { throw new Error("Unexpected privileged access"); } }));
import { CategoryCheckout } from "@/components/booking/category-checkout";
import * as release from "@/lib/checkout/release";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

test("normal production reservations reach the area selector after owner policy approval", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  expect((await CategoryCheckout({})).props.checkoutOpen).toBe(true);
});

test("isolated local fixtures can continue to artwork through the same gate", async () => {
  vi.stubEnv("VERCEL_ENV", ""); vi.stubEnv("VERCEL", ""); vi.stubEnv("VERCEL_URL", "");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("INSIDE914_DEV_TEST_RESERVATIONS", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  expect((await CategoryCheckout({})).props.checkoutOpen).toBe(true);
});

test("the selector receives a closed state if the server release is withdrawn", async () => {
  vi.spyOn(release, "checkoutReleased").mockReturnValue(false);
  expect((await CategoryCheckout({})).props.checkoutOpen).toBe(false);
});
