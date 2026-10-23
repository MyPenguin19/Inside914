import { findPostcardLayout } from "@/lib/print/layouts";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeHouse } from "@/lib/print/export";

export async function POST(request: Request) {
  const { supabase } = await requireAdmin();
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Invalid origin.", { status: 403 });
  if (Number(request.headers.get("content-length")) > 4_000_000) return new Response("Use an image smaller than 3 MB.", { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get("artwork");
    if (!(file instanceof File) || file.size <= 0 || file.size > 3_000_000) throw new Error("Upload a PNG or JPEG smaller than 3 MB.");
    const layout = form.has("layoutKey") ? findPostcardLayout(String(form.get("layoutKey"))) : undefined;
    if (layout === null) throw new Error("Choose a supported house layout.");
    const image = await normalizeHouse(Buffer.from(await file.arrayBuffer()), JSON.parse(String(form.get("crop") ?? "null")), layout);
    const path = `house/${randomUUID()}.png`;
    const admin = createAdminClient(); // authorization above precedes privileged storage access
    const { error } = await admin.storage.from("house-artwork").upload(path, image.input, { contentType: "image/png", upsert: false });
    if (error) throw new Error("Could not store the house artwork. Please retry.");
    const { error: saveError } = await supabase.rpc("admin_set_house_artwork", { p_path: path, p_width: image.width, p_height: image.height });
    if (saveError) {
      await admin.storage.from("house-artwork").remove([path]);
      throw new Error("Could not activate the house artwork. Please retry.");
    }
    return Response.json({ ok: true });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Upload failed.", { status: 400 });
  }
}
export async function GET() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("house_artwork").select("storage_path").eq("singleton", true).maybeSingle();
  if (error) return new Response("Could not load house artwork.", { status: 503 });
  if (!data) return new Response("No house artwork configured.", { status: 404 });
  const file = await createAdminClient().storage.from("house-artwork").download(data.storage_path);
  if (file.error || !file.data) return new Response("Could not load house artwork.", { status: 503 });
  return new Response(file.data, { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
