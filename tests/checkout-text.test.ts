import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { consentText, TERMS_VERSION } from "@/lib/checkout/terms";
import { reservationConfirmedEmail } from "@/lib/email/reservation-confirmed";

describe("future-payment consent", () => {
  test("names the customer's exact amount: $500 standard, $900 double", () => {
    expect(consentText(50000)).toContain("charge $500, as shown in my reservation summary");
    expect(consentText(90000)).toContain("charge $900, as shown in my reservation summary");
    expect(consentText(50000)).toContain("No charge occurs while the campaign is incomplete");
    expect(TERMS_VERSION).toMatch(/draft/);
  });
});

describe("confirmation email", () => {
  const email = reservationConfirmedEmail({
    businessName: `Tom & Jerry's <script>alert(1)</script>`,
    contactName: "Tom",
    reference: "IN914-7KQ2MX",
    zoneName: "Central Westchester",
    households: 5000,
    issueMonth: "2027-01-01",
    artworkDeadline: "2026-12-16T04:59:59Z",
    side: "front",
    positions: ["F3", "F4"],
    size: "double",
    priceCents: 90000,
    reservationUrl: "https://inside914.example/r/abc123",
    supportEmail: "support@inside914.com",
  });

  test("has the reservation essentials", () => {
    for (const part of [email.html, email.text]) {
      expect(part).toContain("IN914-7KQ2MX");
      expect(part).toContain("Central Westchester");
      expect(part).toContain("F3 + F4");
      expect(part).toContain("$900");
      expect(part).toContain("5,000 homes");
      expect(part).toContain("https://inside914.example/r/abc123");
      expect(part).toContain("support@inside914.com");
    }
    expect(email.text).toContain("No payment has been collected");
    expect(email.subject).toContain("IN914-7KQ2MX");
  });

  test("escapes customer-supplied text in the HTML", () => {
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Tom &amp; Jerry&#39;s &lt;script&gt;");
  });

  test("contains no payment identifiers", () => {
    expect(email.html + email.text).not.toMatch(/\b(cus|seti|pm|pi|sk|pk)_[A-Za-z0-9]/);
  });
});

// Static guarantees over the source tree.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}
const files = sourceFiles("src").map((path) => ({ path, code: readFileSync(path, "utf8") }));

describe("collection is isolated from reservation checkout", () => {
  test("no code creates payments, charges, subscriptions, invoices or checkout sessions", () => {
    const offenders = files.filter(({ path, code }) =>
      path !== "src/lib/payments/charge.ts" &&
      /\b(paymentIntents|charges|subscriptions|invoices|subscriptionSchedules)\s*\.\s*(create|confirm|capture|pay)|checkout\s*\.\s*sessions/.test(code),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  test("browser code never touches secret keys or the admin client", () => {
    const client = files.filter(({ code }) => /^["']use client["']/.test(code.trimStart()));
    expect(client.length).toBeGreaterThan(0);
    const leaks = client.filter(({ code }) =>
      /STRIPE_SECRET_KEY|SUPABASE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|RESEND_API_KEY|@\/lib\/supabase\/admin|@\/lib\/env\/(server|checkout)|from "stripe"/.test(code),
    );
    expect(leaks.map((f) => f.path)).toEqual([]);
  });
});
