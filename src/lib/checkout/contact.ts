import { z } from "zod";

// Customer details form: validated and normalized identically wherever it's checked.

export const BUSINESS_CATEGORIES = [
  "Restaurant or cafe",
  "Health and wellness",
  "Home services",
  "Real estate",
  "Retail shop",
  "Professional services",
  "Beauty and personal care",
  "Fitness",
  "Education and childcare",
  "Automotive",
  "Other",
] as const;

// US/Canada numbers -> E.164 (+1XXXXXXXXXX); null if it can't be a real number.
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10 || !/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `+1${digits}`;
}

export function formatPhone(e164: string) {
  const d = e164.replace(/^\+1/, "");
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// "joespizza.com" -> "https://joespizza.com"; null if not a plausible web address.
export function normalizeWebsite(input: string): string | null {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  try {
    const url = new URL(withScheme);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

const text = (label: string, max: number) =>
  z.string().trim().min(1, `Please enter ${label}.`).max(max, `Please keep ${label} under ${max} characters.`);

export const ContactSchema = z.object({
  businessName: text("your business name", 120),
  contactName: text("your name", 120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Please enter a valid email address, like name@business.com.")),
  phone: z
    .string()
    .trim()
    .min(1, "Please enter a phone number.")
    .transform((v, ctx) => {
      const phone = normalizePhone(v);
      if (!phone) ctx.addIssue({ code: "custom", message: "Please enter a 10-digit US phone number, like (914) 555-0123." });
      return phone ?? "";
    }),
  website: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (!v) return null;
      const url = normalizeWebsite(v);
      if (!url) ctx.addIssue({ code: "custom", message: "Please enter a web address like yourbusiness.com, or leave it blank." });
      return url;
    }),
  category: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.enum(BUSINESS_CATEGORIES).nullable()),
});

export type Contact = z.output<typeof ContactSchema>;
export type ContactField = keyof z.input<typeof ContactSchema>;
export type ContactErrors = Partial<Record<ContactField, string>>;

export function parseContact(raw: Record<string, unknown>): { ok: true; contact: Contact } | { ok: false; errors: ContactErrors } {
  const input = Object.fromEntries(
    (["businessName", "contactName", "email", "phone", "website", "category"] as const).map((k) => [
      k,
      typeof raw[k] === "string" ? raw[k] : "",
    ]),
  );
  const result = ContactSchema.safeParse(input);
  if (result.success) return { ok: true, contact: result.data };
  const errors: ContactErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as ContactField;
    errors[field] ??= field === "category" ? "Please choose a category from the list." : issue.message;
  }
  return { ok: false, errors };
}
