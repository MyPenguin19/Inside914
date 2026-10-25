import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), queue: vi.fn(), process: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }));
vi.mock("@/lib/email/delivery", () => ({ queueDelivery: mocks.queue, processDelivery: mocks.process }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
import { verifyOwnerEmail } from "@/app/admin/email-actions";
import { getOwnerVerificationConfig } from "@/lib/email/owner-verification";

let result: { status: string; provider_outcome: string | null };
function form() { const data = new FormData(); data.set("confirmed", "send"); return data; }
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40));
  vi.stubEnv("ADMIN_NOTIFICATION_EMAIL", "info@example.com");
  vi.stubEnv("RESEND_API_KEY", "re_fixture");
  vi.stubEnv("EMAIL_FROM", "Inside914 <sender@example.com>");
  result = { status: "accepted", provider_outcome: null };
  const query = { select: () => query, eq: () => query, single: async () => ({ data: result, error: null }) };
  mocks.auth.mockResolvedValue({});
  mocks.client.mockReturnValue({ from: () => query });
  mocks.queue.mockResolvedValue("only-this-delivery");
  mocks.process.mockResolvedValue("sent");
});
afterEach(() => vi.unstubAllEnvs());

test("authentication precedes configuration, service access and sending", async () => {
  mocks.auth.mockRejectedValue(new Error("Sign in"));
  await expect(verifyOwnerEmail({}, form())).rejects.toThrow("Sign in");
  expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled();
});
test("sending requires an explicit confirmation, not just viewing Settings", async () => {
  expect((await verifyOwnerEmail({}, new FormData())).ok).toBe(false);
  expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled();
});
test("recipient and message identity cannot be supplied by the browser; only one delivery is processed", async () => {
  const data = form(); data.set("to", "advertiser@example.com"); data.set("logicalKey", "random-new-send");
  expect((await verifyOwnerEmail({}, data)).message).toContain("awaiting webhook confirmation");
  expect(mocks.queue).toHaveBeenCalledWith(mocks.client.mock.results[0].value, `owner-verification:${"a".repeat(40)}`, expect.objectContaining({ to: "info@example.com", subject: "Inside914 — deployed app email verification" }));
  expect(mocks.process).toHaveBeenCalledExactlyOnceWith(mocks.client.mock.results[0].value, "only-this-delivery", undefined);
});
test.each(["VERCEL_GIT_COMMIT_SHA", "ADMIN_NOTIFICATION_EMAIL", "RESEND_API_KEY"])("missing %s fails closed before queueing", async (key) => {
  vi.stubEnv(key, "");
  expect((await verifyOwnerEmail({}, form())).ok).toBe(false);
  expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled();
});
test("verification is production-only and validates release and recipient", () => {
  vi.stubEnv("VERCEL_ENV", "preview"); expect(getOwnerVerificationConfig).toThrow();
  vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("ADMIN_NOTIFICATION_EMAIL", "invalid"); expect(getOwnerVerificationConfig).toThrow();
  vi.stubEnv("ADMIN_NOTIFICATION_EMAIL", "info@example.com"); vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "invalid"); expect(getOwnerVerificationConfig).toThrow();
});
test("only a reconciled delivered webhook is reported as delivered", async () => {
  result = { status: "accepted", provider_outcome: "email.delivered" };
  expect((await verifyOwnerEmail({}, form())).message).toContain("email delivered");
  result = { status: "investigation", provider_outcome: null };
  expect((await verifyOwnerEmail({}, form())).ok).toBe(false);
});
