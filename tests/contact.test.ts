import { describe, expect, test } from "vitest";
import { normalizePhone, normalizeWebsite, parseContact } from "@/lib/checkout/contact";

const valid = {
  businessName: "  Luigi's Pizzeria ",
  contactName: "Ana Ruiz",
  email: "  Owner@LuigisPizza.COM ",
  phone: "(914) 555-0123",
  website: "luigispizza.com",
  category: "Restaurant or cafe",
};

describe("customer details", () => {
  test("valid details are accepted and normalized", () => {
    expect(parseContact(valid)).toEqual({
      ok: true,
      contact: {
        businessName: "Luigi's Pizzeria",
        contactName: "Ana Ruiz",
        email: "owner@luigispizza.com",
        phone: "+19145550123",
        website: "https://luigispizza.com",
        category: "Restaurant or cafe",
      },
    });
  });

  test("optional fields may be blank", () => {
    const result = parseContact({ ...valid, website: "", category: "" });
    expect(result).toMatchObject({ ok: true, contact: { website: null, category: null } });
  });

  test("missing required fields each get their own message", () => {
    const result = parseContact({ businessName: "", contactName: " ", email: "", phone: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["businessName", "contactName", "email", "phone"]);
    expect(result.errors.businessName).toMatch(/business name/);
  });

  test("invalid email and phone are rejected with helpful messages", () => {
    const result = parseContact({ ...valid, email: "luigi@", phone: "555-0123" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.email).toMatch(/valid email/);
    expect(result.errors.phone).toMatch(/10-digit/);
  });

  test("unknown categories and bad websites are rejected", () => {
    const result = parseContact({ ...valid, category: "<script>", website: "not a site" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.category).toBeTruthy();
    expect(result.errors.website).toBeTruthy();
  });
});

describe("normalizers", () => {
  test.each([
    ["914-555-0123", "+19145550123"],
    ["+1 (914) 555 0123", "+19145550123"],
    ["19145550123", "+19145550123"],
    ["5550123", null],
    ["(014) 555-0123", null], // area codes can't start with 0 or 1
    ["914-055-0123", null],
  ])("phone %s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  test.each([
    ["luigis.com", "https://luigis.com"],
    ["http://luigis.com/menu", "http://luigis.com/menu"],
    ["javascript:alert(1)", null],
    ["localhost", null],
  ])("website %s -> %s", (input, expected) => {
    expect(normalizeWebsite(input)).toBe(expected);
  });
});
