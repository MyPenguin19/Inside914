import { afterEach, expect, test, vi } from "vitest";

vi.mock("@/lib/operations/notifications",()=>({queueOwnerNotifications:vi.fn(),dispatchOwnerNotifications:vi.fn()}));
vi.mock("@/lib/email/delivery", () => ({processDueDeliveries: vi.fn(async()=>[])}));
vi.mock("@/lib/checkout/card-removal", () => ({ processDueCardRemovals: vi.fn() }));
vi.mock("@/lib/checkout/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/email/outbox", () => ({ processDueOutbox: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
const { GET } = await import("@/app/api/internal/email-outbox/route");
const { createAdminClient } = await import("@/lib/supabase/admin");
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

test.each(["Bearer wrong", "Bearer éééééé", ""])("rejects invalid cron authorization without database or payment work: %s", async (authorization) => {
  vi.stubEnv("CRON_SECRET", "secret");
  const response = await GET(new Request("http://localhost/api/internal/email-outbox", { headers: { authorization } }));
  expect(response.status).toBe(401);
  expect(createAdminClient).not.toHaveBeenCalled();
});

test("cron stays disabled without a configured secret", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await GET(new Request("http://localhost/api/internal/email-outbox"))).status).toBe(401);
  expect(createAdminClient).not.toHaveBeenCalled();
});
