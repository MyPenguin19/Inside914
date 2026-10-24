import { findPostcardLayout } from "@/lib/print/layouts";
import { AMAZINGMAIL_9X6_LAYOUT } from "@/lib/print/amazingmail-layout";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveHouseArtwork } from "@/lib/print/house-artwork";

export async function POST(request: Request) {
  const { supabase } = await requireAdmin();
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Invalid origin.", { status: 403 });
  if (Number(request.headers.get("content-length")) > 4_000_000) return new Response("Use an image smaller than 3 MB.", { status: 413 });
  try {
    const form = await request.formData();
    const file = form.get("artwork");
    if (!(file instanceof File) || file.size <= 0 || file.size > 3_000_000) throw new Error("Upload a PNG or JPEG smaller than 3 MB.");
    const layout = form.has("layoutKey") ? findPostcardLayout(String(form.get("layoutKey"))) : AMAZINGMAIL_9X6_LAYOUT;
    if (!layout) throw new Error("Choose a supported house layout.");
    const result = await saveHouseArtwork(createAdminClient(), supabase, Buffer.from(await file.arrayBuffer()),
      JSON.parse(String(form.get("crop") ?? "null")), layout, String(form.get("baseUpdatedAt") ?? "") || null);
    return Response.json(result);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Upload failed.", { status: 400 });
  }
}
export async function GET(request: Request) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("house_artwork").select("storage_path,updated_at").eq("singleton", true).maybeSingle();
  if (error) return new Response("Could not load house artwork.", { status: 503 });
  if (!data) return new Response("No house artwork configured.", { status: 404 });
  const expected = new URL(request.url).searchParams.get("verify");
  if (expected && expected !== data.updated_at) return new Response("The active artwork changed. Reload Settings.", { status: 409 });
  const file = await createAdminClient().storage.from("house-artwork").download(data.storage_path);
  if (file.error || !file.data) return new Response("Could not load house artwork.", { status: 503 });
  return new Response(file.data, { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-House-Artwork-Version": data.updated_at } });
}
