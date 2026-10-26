import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { CONTACT_RECEIVED } from "@/lib/contact/schema";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ queue: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/email/delivery", () => ({ queueDelivery: mocks.queue }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ SUPABASE_SECRET_KEY: "sb_secret_fixture" }) }));
vi.mock("@/lib/env/checkout", () => ({ getEmailEnv: () => ({ from: "Inside914 <sender@inside914.com>" }) }));
import { queueContactMessage } from "@/lib/contact/service";
const db = { rpc: mocks.rpc } as unknown as SupabaseClient<Database>;
const input = () => ({ name: "Jane Visitor", email: "Jane@example.com", phone: "914-555-0100", message: "I would like to learn about advertising.", website: "", submissionId: randomUUID() });
beforeEach(() => {
  vi.stubEnv("INSIDE914_DEV_TEST_RESERVATIONS", "false");
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.queue.mockResolvedValue("delivery-fixture");
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

test("queues only to the owner, keeps the verified sender and sets visitor Reply-To", async () => {
  const value = { ...input(), name: "<img src=x onerror=alert(1)>", message: "Hello <script>alert(1)</script> & welcome", to: "attacker@example.com", from: "forged@example.com" };
  expect(await queueContactMessage(db, value, "203.0.113.1")).toMatchObject({ deliveryId: "delivery-fixture", state: { ok: true, message: CONTACT_RECEIVED } });
  const [, key, message, options] = mocks.queue.mock.calls[0];
  expect(key).toMatch(/^contact:[a-f0-9]{64}$/);
  expect(message).toMatchObject({ from: "Inside914 <sender@inside914.com>", to: "info@inside914.com", replyTo: "jane@example.com" });
  expect(message.html).toContain("&lt;script&gt;");
  expect(message.html).not.toMatch(/<script>|<img/);
  expect(message.text).toContain(value.message);
  expect(options).toEqual({ isTest: false });
  expect(mocks.rpc.mock.calls.map(call => call[1].p_max)).toEqual([5, 3, 100]);
  expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/203\.0\.113\.1|Jane@example|jane@example/);
});
test.each([{ email: "bad" }, { email: "a@example.com\r\nBcc: injected@example.com" }, { name: "" }, { message: "short" }, { message: "a".repeat(5001) }, { phone: "1".repeat(41) }, { submissionId: "invalid" }])("rejects invalid input before database or email work: %j", async override => {
  expect((await queueContactMessage(db, { ...input(), ...override }, "address")).state.ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled();
});
test("honeypot silently discards a bot submission without creating a delivery", async () => {
  expect((await queueContactMessage(db, { ...input(), website: "spam.example" }, "address")).state.ok).toBe(true);
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled();
});
test("limits fail closed and never enqueue mail", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await queueContactMessage(db, input(), "address")).state.message).toContain("Too many messages");
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "database error" } });
  await expect(queueContactMessage(db, input(), "address")).rejects.toThrow("contact_rate_limit_unavailable");
  expect(mocks.queue).not.toHaveBeenCalled();
});
test("retries reuse one identity while an edited message gets a separate identity", async () => {
  const value = input();
  await queueContactMessage(db, value, "address");
  await queueContactMessage(db, value, "address");
  await queueContactMessage(db, { ...value, message: "A corrected advertising question." }, "address");
  expect(mocks.queue.mock.calls[0][1]).toBe(mocks.queue.mock.calls[1][1]);
  expect(mocks.queue.mock.calls[2][1]).not.toBe(mocks.queue.mock.calls[0][1]);
});
