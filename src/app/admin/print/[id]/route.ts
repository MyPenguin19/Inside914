import { loadHouseArtwork } from "@/lib/print/house-artwork";
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
  const form = await request.formData();
  const side = z.enum(["front", "back"]).safeParse(form.get("side"));
  if (!side.success) return new Response("Choose front or back.", { status: 400 });
  const { data: edition } = await supabase.from("editions").select("product_model,layout_template").eq("id", id).single();
  if (edition?.product_model !== "square_v1" || edition.layout_template !== AMAZINGMAIL_9X6_LAYOUT.key) return new Response("This campaign does not use the square layout.", { status: 400 });
  try {
    const { data: bookings, error } = await supabase.from("bookings").select("id,status,booking_slots(slot_id,released_at,slots(label,side)),booking_artwork(*)").eq("edition_id", id).not("status", "in", "(pending,released,cancelled)");
    if (error) throw new Error("Could not load campaign artwork. Please retry.");
    const admin = createAdminClient();
    const ads: PrintImage[] = [];
    const occupied: string[] = [];
    for (const b of bookings ?? []) {
      const claims = b.booking_slots.filter(s => !s.released_at && s.slots?.side === side.data);
      for (const claim of claims) {
        const label = claim.slots!.label;
        occupied.push(label);
        const a = b.booking_artwork;
        if (!a || a.status !== "ready" || a.crop_x === null || a.crop_y === null || a.crop_width === null || a.crop_height === null) continue;
        const file = await admin.storage.from("artwork").download(a.storage_path);
        if (file.error || !file.data) throw new Error("Could not read an advertisement. Please retry.");
        ads.push({ label, input: Buffer.from(await file.data.arrayBuffer()), crop: { x: a.crop_x, y: a.crop_y, width: a.crop_width, height: a.crop_height } });
      }
    }
    // Failure to load/validate house artwork never blocks either side. It only
    // downgrades the shared final-readiness label and leaves the back panel blank.
    const house = await loadHouseArtwork(supabase);
    // Downloads never approve a campaign or alter payments. Readiness is a separate DB check.
    const readiness = await supabase.rpc("admin_mail_readiness", { p_id: id });
    const ready = !!house && !readiness.error && readiness.data === true;
    const png = await renderPostcard(side.data, ads, house, occupied);
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="inside914-${id}-${side.data}${ready ? "" : "-PREVIEW"}.png"`, "X-Postcard-Readiness": ready ? "ready" : "preview", "X-House-Artwork-Ready": house ? "true" : "false", "Cache-Control": "private, no-store" } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Could not create the postcard.", { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
