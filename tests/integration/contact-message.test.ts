import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import type { SendEmail } from "@/lib/email/provider";
vi.mock("server-only", () => ({}));
import { queueContactMessage } from "@/lib/contact/service";
import { processDelivery } from "@/lib/email/delivery";
import { decryptEnvelope } from "@/lib/email/envelope";

const db = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const ids = new Set<string>();
const input = () => ({ name: "Local Contact Fixture", email: `contact-${randomUUID()}@example.com`, phone: "", message: "A local-only contact question.", website: "", submissionId: randomUUID() });
beforeEach(() => { vi.stubEnv("INSIDE914_DEV_TEST_RESERVATIONS", "false"); });
afterEach(async () => {
  if (ids.size) { expect((await db.from("email_deliveries").delete().in("id", [...ids])).error).toBeNull(); ids.clear(); }
  vi.unstubAllEnvs();
});
async function queue(value = input(), address = randomUUID()) {
  const result = await queueContactMessage(db, value, address);
  if (result.deliveryId) ids.add(result.deliveryId);
  return result;
}

test("contact retries persist one encrypted delivery and concurrent workers send it once", async () => {
  const value = input(), address = randomUUID();
  const [first, retry] = await Promise.all([queue(value, address), queue(value, address)]);
  expect(first.state.ok).toBe(true); expect(retry.deliveryId).toBe(first.deliveryId);
  const row = (await db.from("email_deliveries").select("*").eq("id", first.deliveryId!).single()).data!;
  expect(row.payload_ciphertext).not.toContain(value.email);
  expect(decryptEnvelope(row.payload_ciphertext, row.logical_key)).toMatchObject({ to: "info@inside914.com", replyTo: value.email, text: expect.stringContaining(value.message) });
  const send = vi.fn<SendEmail>(async () => ({ id: randomUUID() }));
  await Promise.all([processDelivery(db, first.deliveryId!, send), processDelivery(db, first.deliveryId!, send)]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toMatchObject({ to: "info@inside914.com", replyTo: value.email });
});

test("contact limits work across distinct requests without touching reservation limits", async () => {
  const email = input().email;
  for (let i = 0; i < 4; i++) {
    const result = await queue({ ...input(), email });
    expect(result.state.ok).toBe(i < 3);
  }
  const address = randomUUID();
  for (let i = 0; i < 6; i++) expect((await queue(input(), address)).state.ok).toBe(i < 5);
});

test("local test mode never calls an email provider", async () => {
  vi.stubEnv("INSIDE914_DEV_TEST_RESERVATIONS", "true");
  const result = await queue();
  expect(result.state.message).toContain("No email was sent");
  const send = vi.fn<SendEmail>();
  expect(await processDelivery(db, result.deliveryId!, send)).toBe("sent");
  expect(send).not.toHaveBeenCalled();
  expect((await db.from("email_deliveries").select("is_test,provider_message_id").eq("id", result.deliveryId!).single()).data).toEqual({ is_test: true, provider_message_id: "not-delivered:test-reservation" });
});

test("anonymous clients cannot invoke the service-only limiter or read contact payloads", async () => {
  const anon = createClient<Database>(process.env.SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  expect((await anon.rpc("note_hold_attempt", { p_visitor_hash: "a".repeat(64), p_max: 5, p_window_seconds: 3600 })).error).not.toBeNull();
  const result = await queue();
  const read = await anon.from("email_deliveries").select("payload_ciphertext").eq("id", result.deliveryId!);
  expect(read.data ?? []).toHaveLength(0);
});
