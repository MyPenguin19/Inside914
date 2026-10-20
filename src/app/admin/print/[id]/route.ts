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
    let house: Buffer | undefined;
    if (side.data === "back") {
      const { data, error } = await supabase.from("house_artwork").select("storage_path").eq("singleton", true).maybeSingle();
      if (error) throw new Error("Could not load house artwork settings.");
      if (data) {
        const file = await admin.storage.from("house-artwork").download(data.storage_path);
        if (file.error || !file.data) throw new Error("Could not read house artwork. Please retry.");
        house = Buffer.from(await file.data.arrayBuffer());
      }
    }
    // Downloads never approve a campaign or alter payments. Readiness is a separate DB check.
    const readiness = await supabase.rpc("admin_mail_readiness", { p_id: id });
    const ready = !readiness.error && readiness.data === true;
    const png = await renderPostcard(side.data, ads, house, occupied);
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="inside914-${id}-${side.data}${ready ? "" : "-PREVIEW"}.png"`, "X-Postcard-Readiness": ready ? "ready" : "preview", "Cache-Control": "private, no-store" } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Could not create the postcard.", { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
