import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Database } from "../../src/lib/supabase/database.types";
import { POSTCARD_LAYOUT_V2 } from "../../src/lib/print/layouts";
import { deleteLocalCampaignFixtures } from "../integration/local-layout-fixture";
import { assertTestEnvironment } from "../../scripts/test-environment";

const checked = <T extends { data: unknown; error: unknown }>(r: T): T["data"] => { if (r.error) throw new Error(JSON.stringify(r.error)); return r.data; };
export async function createOriginalFixture() {
  assertTestEnvironment();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const db = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const admin = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const anon = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const email = `originals-${randomUUID()}@example.com`, password = randomBytes(24).toString("hex");
  const user = checked(await db.auth.admin.createUser({ email, password, email_confirm: true })).user!;
  checked(await db.from("admins").insert({ user_id: user.id }));
  checked(await admin.auth.signInWithPassword({ email, password }));
  const zone = randomUUID();
  checked(await db.from("zones").insert({ id: zone, name: `Originals fixture ${zone}`, slug: `originals-${zone}`, household_count: 0 }));
  const campaign = checked(await admin.rpc("admin_create_square_campaign", { p: { zone_id: zone, name: "Original backup fixture", issue_month: "2098-08-01", target_quantity: 5000,
    reservation_deadline: "2098-07-15T23:59:00Z", artwork_due_at: "2098-07-20T23:59:00Z", mailing_window_start: "2098-08-11", mailing_window_end: "2098-08-15", layout_template: POSTCARD_LAYOUT_V2.key, unit_price_cents: 100, back_unit_price_cents: 100, double_price_cents: null } }))!;
  checked(await admin.rpc("admin_set_campaign_status", { p_id: campaign, p_action: "open" }));
  const slots = checked(await db.from("slots").select("id,label").eq("edition_id", campaign).order("label").limit(3))!;
  const bookings: string[] = [], paths: string[] = [];
  for (const slot of slots) {
    const hash = createHash("sha256").update(randomBytes(32)).digest("hex");
    const hold = checked(await db.rpc("hold_slots", { p_slot_ids: [slot.id], p_token_hash: hash, p_pricing_mode: "launch", p_unit_price_cents: 100, p_double_price_cents: null }).single())!;
    bookings.push(hold.booking_id);
    checked(await db.from("booking_contacts").insert({ booking_id: hold.booking_id, business_name: `Fixture / Same Name`, contact_name: "Fixture", email: "fixture@example.com", phone: "+19145550123" }));
  }
  const upload = async (bookingId: string, bytes: Buffer, mime: "image/png" | "image/jpeg", missing = false) => {
    const path = `${bookingId}/${randomUUID()}`, meta = await sharp(bytes).metadata(); paths.push(path);
    if (!missing) checked(await db.storage.from("artwork").upload(path, bytes, { contentType: mime, upsert: false }));
    checked(await db.from("booking_artwork").upsert({ booking_id: bookingId, storage_path: path, status: "ready", content_type: mime, byte_size: bytes.length, width_px: meta.width!, height_px: meta.height!, crop_x: 0, crop_y: 0, crop_width: meta.width! - 20, crop_height: meta.height! - 20, zoom: 1.1 }, { onConflict: "booking_id" }));
    return path;
  };
  const historical = await sharp({ create: { width: 1000, height: 900, channels: 4, background: { r: 30, g: 40, b: 60, alpha: 0.4 } } }).png().toBuffer();
  const oldPath = await upload(bookings[0], historical, "image/png");
  // >4.5 MB, exercises direct Storage transfer beyond the Vercel response limit.
  const png = await sharp(randomBytes(1600 * 1200 * 4), { raw: { width: 1600, height: 1200, channels: 4 } }).png().toBuffer();
  const currentPath = await upload(bookings[0], png, "image/png");
  const jpeg = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: "navy" } }).jpeg().toBuffer();
  const jpegPath = await upload(bookings[1], jpeg, "image/jpeg");
  const missingPath = await upload(bookings[2], jpeg, "image/jpeg", true);
  const snapshot = async () => checked(await db.from("booking_artwork").select("*").in("booking_id", bookings).order("booking_id"));
  return { db, admin, anon, campaign, bookings, email, password, png, jpeg, historical, currentPath, oldPath, jpegPath, missingPath, snapshot,
    async cleanup() {
      checked(await db.from("bookings").delete().in("id", bookings));
      checked(await db.storage.from("artwork").remove(paths));
      checked(await db.from("artwork_uploads").delete().in("booking_id", bookings));
      deleteLocalCampaignFixtures([campaign]);
      checked(await db.from("zones").delete().eq("id", zone));
      checked(await db.from("admin_events").delete().eq("admin_user_id", user.id));
      await admin.auth.signOut(); checked(await db.auth.admin.deleteUser(user.id));
    },
  };
}
