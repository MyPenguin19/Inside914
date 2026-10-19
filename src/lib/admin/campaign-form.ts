import { z } from "zod";
import { SQUARE_PRODUCT } from "@/lib/booking/square-product";
import { findTemplate } from "./layouts";

// Campaign form parsing (shared by create and edit). Times are entered in Westchester time
// (America/New_York) and stored as UTC; money is entered in dollars and stored in integer cents.

const ZONE = "America/New_York";

// "2026-12-15T23:59" (New York wall time) -> UTC ISO string, DST-aware.
export function nyLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Offset of New York at that moment (try the naive guess, then correct once).
  const offset = (t: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        .formatToParts(new Date(t))
        .map((p) => [p.type, p.value]),
    );
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - t;
  };
  let t = asUtc - offset(asUtc);
  t = asUtc - offset(t);
  return new Date(t).toISOString();
}

// UTC ISO -> "YYYY-MM-DDTHH:mm" in New York (for datetime-local inputs).
export function isoToNyLocal(iso: string | null) {
  if (!iso) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const dollars = z
  .string()
  .trim()
  .regex(/^\d{1,6}(\.\d{1,2})?$/, "Enter an amount like 500 or 499.99")
  .transform((v) => Math.round(Number(v) * 100))
  .refine((c) => c > 0, "Must be more than $0");
const optionalDollars = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.union([z.null(), dollars]));
const nyTime = (label: string) =>
  z.string().transform((v, ctx) => {
    const iso = nyLocalToIso(v);
    if (!iso) ctx.addIssue({ code: "custom", message: `Enter the ${label}` });
    return iso ?? "";
  });
const day = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter the ${label}`);

export const CampaignForm = z
  .object({
    name: z.string().trim().min(1, "Enter a campaign name").max(120),
    zone_id: z.uuid("Choose an area"),
    issue_month: z.string().regex(/^\d{4}-\d{2}$/, "Choose the mailing month").transform((m) => `${m}-01`),
    target_quantity: z.coerce.number().int("Whole homes only").positive("Must be more than 0").max(1_000_000),
    reservations_open_at: z.string().transform((v, ctx) => {
      if (v === "") return null;
      const iso = nyLocalToIso(v);
      if (!iso) ctx.addIssue({ code: "custom", message: "Enter a valid opening date" });
      return iso;
    }),
    reservation_deadline: nyTime("reservation deadline"),
    artwork_due_at: nyTime("artwork deadline"),
    mailing_window_start: day("first mailing day"),
    mailing_window_end: day("last mailing day"),
    layout_template: z.string().refine((k) => findTemplate(k) !== null, "Choose a layout"),
    unit_price_cents: dollars,
    double_price_cents: optionalDollars,
  })
  .superRefine((v, ctx) => {
    if (v.layout_template === SQUARE_PRODUCT.layoutKey && (v.unit_price_cents !== SQUARE_PRODUCT.priceCents || v.double_price_cents !== null)) {
      ctx.addIssue({ code: "custom", path: ["unit_price_cents"], message: "Square ads are fixed at $399 per area; other sizes are unavailable." });
    }
    const t = (s: string | null) => (s ? Date.parse(s) : NaN);
    if (v.reservations_open_at && t(v.reservations_open_at) >= t(v.reservation_deadline)) {
      ctx.addIssue({ code: "custom", path: ["reservations_open_at"], message: "Reservations must open before the deadline" });
    }
    if (t(v.artwork_due_at) < t(v.reservation_deadline)) {
      ctx.addIssue({ code: "custom", path: ["artwork_due_at"], message: "Artwork can't be due before the reservation deadline" });
    }
    if (v.mailing_window_start < v.artwork_due_at.slice(0, 10)) {
      ctx.addIssue({ code: "custom", path: ["mailing_window_start"], message: "Mailing can't start before artwork is due" });
    }
    if (v.mailing_window_end < v.mailing_window_start) {
      ctx.addIssue({ code: "custom", path: ["mailing_window_end"], message: "The window must end on or after it starts" });
    }
    if (v.double_price_cents !== null && v.double_price_cents <= v.unit_price_cents) {
      ctx.addIssue({ code: "custom", path: ["double_price_cents"], message: "A double space should cost more than a standard one" });
    }
  });

export type CampaignFieldErrors = Partial<Record<keyof z.input<typeof CampaignForm>, string>>;

export const CAMPAIGN_FIELDS = [
  "name", "zone_id", "issue_month", "target_quantity", "reservations_open_at", "reservation_deadline", "artwork_due_at",
  "mailing_window_start", "mailing_window_end", "layout_template", "unit_price_cents", "double_price_cents",
] as const;

export function parseCampaignForm(form: FormData) {
  const raw = Object.fromEntries(CAMPAIGN_FIELDS.map((f) => [f, String(form.get(f) ?? "")]));
  const parsed = CampaignForm.safeParse(raw);
  if (parsed.success) return { ok: true as const, value: parsed.data, raw };
  const errors: CampaignFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof CampaignFieldErrors;
    errors[key] ??= issue.message;
  }
  return { ok: false as const, errors, raw };
}

// Database error codes from the admin_* functions -> plain sentences.
export function adminErrorMessage(error: { code?: string; message?: string } | null): string {
  const m = error?.message ?? "";
  const known: Record<string, string> = {
    square_price_is_fixed: "New campaigns require ten square ads at $399 each.",
    not_admin: "Your admin session has ended. Please sign in again.",
    not_found: "That record no longer exists.",
    invalid_input: "Some details are missing or invalid.",
    zone_exists: "A zone with this name or slug already exists.",
    invalid_zone: "Enter a valid zone name, slug and provisional household estimate.",
    zone_slug_in_use: "The slug cannot change after a campaign uses this zone.",
    layout_not_approved: "Printer or mail-house layout approval is required before reservations can open.",
    zone_not_found: "That area doesn't exist.",
    dates_out_of_order: "The dates are out of order: opening → reservation deadline → artwork due → mailing window.",
    campaign_exists_for_month: "This area already has a campaign for that month.",
    locked_by_reservations: "Customers have already booked this campaign, so only its name and target quantity can change.",
    campaign_finished: "This campaign is finished and can't be changed.",
    deadline_passed: "The reservation deadline has passed. Move it later (while no one has booked) before opening.",
    no_layout: "Choose a layout before opening.",
    no_inventory: "This campaign has no advertising spaces yet.",
    no_pricing: "Set prices before opening.",
    another_open_campaign_in_area: "Another campaign in this area is already open. Close it first.",
    not_open: "This campaign isn't open.",
    has_reservations: "This campaign has confirmed reservations. It can only be canceled after its deadline passes without filling.",
    close_reservations_first: "Close reservations first.",
    artwork_not_all_approved: "Every confirmed reservation needs approved artwork first.",
    needs_printer_confirmation: "Upload the printer's confirmation as evidence first.",
    needs_mailing_evidence: "Upload a postal acceptance or mailing confirmation as evidence first.",
    not_approved_to_print: "Approve the campaign for print first.",
    not_printed: "Mark the campaign as printed first.",
    not_mailed: "Mark the campaign as mailed first.",
    reason_required: "Please give a reason.",
    slot_occupied: "That space is held or reserved, so it can't be blocked.",
    already_released: "This booking already ended, so there's nothing to cancel.",
    payment_state_needs_resolution: "This reservation has a payment state. It needs the payment-resolution workflow, not a simple cancellation.",
    artwork_incomplete: "This artwork isn't fully uploaded and positioned, so it can't be reviewed.",
    booking_ended: "This booking has ended, so its artwork can't be reviewed.",
    note_required: "Write a note first.",
    not_full: "Every sellable space must be reserved before printing. If the deadline passed, extend it or cancel the campaign.",
    campaign_is_full: "This campaign is fully reserved, so it can't be canceled for not filling.",
    deadline_must_be_future: "The new deadline must be in the future.",
    deadline_must_be_later: "The new deadline must be later than the current one.",
  };
  if (m.startsWith("cannot_open_from_")) return `A campaign that's ${m.replace("cannot_open_from_", "").replaceAll("_", " ")} can't be opened.`;
  if (m.startsWith("cannot_extend_from_")) return `A campaign that's ${m.replace("cannot_extend_from_", "").replaceAll("_", " ")} can't get a new deadline.`;
  if (m.startsWith("cannot_cancel_from_")) return `A campaign that's ${m.replace("cannot_cancel_from_", "").replaceAll("_", " ")} can't be canceled.`;
  return known[m] ?? "Something went wrong. Nothing was changed.";
}

// "Extend deadline" form: a later reservation deadline, plus later artwork/mailing dates when the
// new deadline needs them (blank = unchanged). The database re-checks the order of all dates.
export function parseExtendDeadlineForm(form: FormData): { ok: true; payload: Record<string, string> } | { ok: false; message: string } {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const deadline = nyLocalToIso(text("reservation_deadline"));
  if (!deadline) return { ok: false, message: "Choose the new reservation deadline." };
  const payload: Record<string, string> = { reservation_deadline: deadline };
  if (text("artwork_due_at")) {
    const due = nyLocalToIso(text("artwork_due_at"));
    if (!due) return { ok: false, message: "The artwork due date isn't valid." };
    payload.artwork_due_at = due;
  }
  for (const key of ["mailing_window_start", "mailing_window_end"]) {
    const day = text(key);
    if (!day) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, message: "The mailing window dates aren't valid." };
    payload[key] = day;
  }
  return { ok: true, payload };
}
