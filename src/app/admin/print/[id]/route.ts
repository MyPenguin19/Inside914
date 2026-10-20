import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderPostcard, type PrintImage } from "@/lib/print/export";
import { AMAZINGMAIL_9X6_LAYOUT } from "@/lib/print/amazingmail-layout";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Invalid campaign.", { status: 400 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Invalid origin.", { status: 403 });
  if (Number(request.headers.get("content-length")) > 21_000_000) return new Response("House artwork is too large.", { status: 413 });
  const form = await request.formData();
  const side = z.enum(["front", "back"]).safeParse(form.get("side"));
  if (!side.success) return new Response("Choose front or back.", { status: 400 });
  const { data: edition } = await supabase.from("editions").select("product_model,layout_template").eq("id", id).single();
  if (edition?.product_model !== "square_v1" || edition.layout_template !== AMAZINGMAIL_9X6_LAYOUT.key) return new Response("This campaign does not use the square layout.", { status: 400 });
  try {
    const { data: bookings, error } = await supabase.from("bookings").select("id,status,booking_slots(slot_id,released_at,slots(label,side)),booking_artwork(*)").eq("edition_id", id).not("status", "in", "(pending,released,cancelled)");
    if (error || bookings?.length !== 10) throw new Error("All 10 paid positions must be reserved before downloading the complete postcard.");
    const active = bookings.map(b => ({ ...b, claims: b.booking_slots.filter(s => !s.released_at) }));
    if (active.some(b => b.claims.length !== 1 || b.booking_artwork?.status !== "ready" || b.booking_artwork.review_status !== "approved") || new Set(active.flatMap(b => b.claims.map(s => s.slot_id))).size !== 10) throw new Error("Approve all 10 advertisements before downloading the postcard.");
    const admin = createAdminClient(); // authenticated administrator verified above
    const ads: PrintImage[] = [];
    for (const b of active.filter(b => b.claims[0].slots?.side === side.data)) {
      const a = b.booking_artwork!;
      if (a.crop_x === null || a.crop_y === null || a.crop_width === null || a.crop_height === null) throw new Error("An advertisement needs its crop saved.");
      const file = await admin.storage.from("artwork").download(a.storage_path);
      if (file.error || !file.data) throw new Error("Could not read an advertisement. Please retry.");
      ads.push({ label: b.claims[0].slots!.label, input: Buffer.from(await file.data.arrayBuffer()), crop: { x: a.crop_x, y: a.crop_y, width: a.crop_width, height: a.crop_height } });
    }
    const houses: Buffer[] = [];
    if (side.data === "back") for (const name of ["inside914", "inside-diagnostics"]) {
      const file = form.get(name);
      if (!(file instanceof File) || !["image/png", "image/jpeg"].includes(file.type) || file.size <= 0 || file.size > 10_000_000) throw new Error("Add both house advertisements as PNG or JPEG files, up to 10 MB each.");
      houses.push(Buffer.from(await file.arrayBuffer()));
    }
    const png = await renderPostcard(side.data, ads, houses);
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="inside914-${id}-${side.data}.png"`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Could not create the postcard.", { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
