import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../src/lib/supabase/database.types";

// The Playwright config and wrapper enforce localhost and blank real provider credentials.
const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
test("contact form validates and queues a local-only email", async ({ page }) => {
  const existing = await db.from("email_deliveries").select("id").eq("is_test", true).like("logical_key", "contact:%");
  expect(existing.error).toBeNull();
  const existingIds = new Set(existing.data!.map(row => row.id));
  const createdIds = new Set<string>();
  await page.goto("/");
  await expect(page.locator('footer a[href="tel:+19148795022"]')).toHaveText("914-879-5022");
  await page.locator('footer a[href="/contact"]').click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contact Inside914");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Please check your details");
  await expect(page.getByLabel(/Your name/)).toHaveAttribute("aria-invalid", "true");
  const email = `contact-e2e-${randomUUID()}@example.com`;
  await page.getByLabel(/Your name/).fill("Local Browser Fixture");
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Message/).fill("Please send information about advertising.");
  try {
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("status")).toHaveText("Test message saved locally. No email was sent.");
    await expect.poll(async () => {
      const result = await db.from("email_deliveries").select("id,is_test,provider_message_id").eq("is_test", true).like("logical_key", "contact:%");
      expect(result.error).toBeNull();
      const created = result.data!.filter(row => !existingIds.has(row.id));
      created.forEach(row => createdIds.add(row.id));
      return created.map(({ is_test, provider_message_id }) => ({ is_test, provider_message_id }));
    }).toEqual([{ is_test: true, provider_message_id: "not-delivered:test-reservation" }]);
  } finally {
    if (createdIds.size) expect((await db.from("email_deliveries").delete().in("id", [...createdIds]).eq("is_test", true)).error).toBeNull();
  }
});
