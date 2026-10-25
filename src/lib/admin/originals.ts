import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { archiveIssue, MAX_ARCHIVE_FILES, MAX_ORIGINAL_BYTES, safeFilenamePart, type OriginalPlan, type OriginalSource } from "@/lib/artwork/original-types";

type Db = SupabaseClient<Database>;
type FileRow = Database["public"]["Tables"]["booking_artwork"]["Row"];
type Upload = Database["public"]["Tables"]["artwork_uploads"]["Row"];
export type LocatedOriginal = { source: OriginalSource; path: string | null };
export const ORIGINAL_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };
export const ORIGINAL_LINK_SECONDS = 120;

export function safeStoragePath(path: string) {
  return !!path && path.length < 1024 && !/[\\%?#\u0000-\u0020\u007f]/.test(path) && path.split("/").every(p => !!p && p !== "." && p !== "..");
}

// Callers requireAdmin first. All ownership discovery uses that admin's RLS client.
// A current booking_artwork association is authoritative even for legacy shared-cart paths.
// Historical lookups only use retained ledger rows associated with this booking, never a caller path.
export async function locateOriginals(db: Db, bookingId: string, history = false): Promise<LocatedOriginal[] | null> {
  const { data: b, error } = await db.from("bookings").select("id,reference,booking_contacts(business_name),editions(name,zones(name)),booking_slots(released_at,slots(label)),booking_artwork(*)").eq("id", bookingId).maybeSingle();
  if (error) throw new Error("Could not read artwork records.");
  if (!b) return null;
  const { data: uploads, error: uploadError } = await db.from("artwork_uploads").select("*").eq("booking_id", bookingId).eq("bucket", "artwork").eq("status", "retained").order("created_at", { ascending: false }).limit(101);
  if (uploadError) throw new Error("Could not read retained artwork records.");
  if (history && uploads && uploads.length > 100) throw new Error("Too many retained versions for one archive. Download current originals and contact the owner for the retained-source backup.");
  const current = b.booking_artwork?.status === "ready" ? b.booking_artwork : null;
  const make = (row: FileRow | Upload | null, kind: OriginalSource["kind"]): LocatedOriginal => {
    const path = row?.storage_path ?? null;
    const ledger = uploads?.find(u => u.storage_path === path);
    const meta = ledger?.metadata;
    const hash = meta && typeof meta === "object" && !Array.isArray(meta) && typeof meta.sha256 === "string" && /^[a-f0-9]{64}$/i.test(meta.sha256) ? meta.sha256.toLowerCase() : null;
    const mime = row?.content_type ?? null;
    const version = path ? createHash("sha256").update(path).digest("hex") : "missing";
    const zone = b.editions?.zones?.name ?? "Unknown area";
    const business = b.booking_contacts?.business_name ?? "Advertiser";
    const extension = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "bin";
    return { path, source: {
      bookingId, reference: b.reference ?? bookingId, business, zone, campaign: b.editions?.name ?? zone,
      position: b.booking_slots.filter(s => !s.released_at).map(s => s.slots?.label).filter(Boolean).join(" + ") || "No active position",
      version, kind, filename: `Inside914_${safeFilenamePart(zone)}_${safeFilenamePart(business)}_${bookingId}_${kind === "historical" ? `Historical-${version.slice(0, 12)}` : "Original"}.${extension}`,
      width: row?.width_px ?? null, height: row?.height_px ?? null, mime, bytes: row?.byte_size ?? null,
      uploadedAt: ledger?.created_at ?? row?.created_at ?? null,
      review: kind === "current" ? current?.review_status ?? "unavailable" : "Historical — not current approval",
      knownSha256: hash, issue: !path ? "No current original is recorded." : !safeStoragePath(path) ? "Source path is invalid; owner review required." : null,
    } };
  };
  return [make(current, "current"), ...(history ? (uploads ?? []).filter(u => u.storage_path !== current?.storage_path).map(u => make(u, "historical")) : [])];
}

// Privileged Storage access only after requireAdmin + RLS association above; no file bytes proxy.
export async function inspectOriginal(storage: Db, located: LocatedOriginal): Promise<OriginalSource> {
  const source = { ...located.source };
  if (source.issue || !located.path) return source;
  const info = await storage.storage.from("artwork").info(located.path);
  if (info.error || !info.data) return { ...source, issue: "Original source unavailable in private Storage. No substitute was used." };
  const size = info.data.size;
  if (!size || size > MAX_ORIGINAL_BYTES) return { ...source, issue: "Source exceeds the supported 20 MB file limit or has invalid size. Use the owner's retained-source backup." };
  if (source.bytes !== null && source.bytes !== size) return { ...source, issue: "Source size differs from its recorded upload. Owner review required." };
  source.bytes = size;
  const mime = info.data.contentType?.split(";")[0];
  if (mime !== "image/png" && mime !== "image/jpeg") return { ...source, issue: "Source is not a recorded PNG or JPEG. Owner review required." };
  if (source.mime && mime !== source.mime) return { ...source, issue: "Source type differs from its recorded upload. Owner review required." };
  source.mime = mime;
  source.filename = source.filename.replace(/\.(bin|png|jpg)$/, mime === "image/png" ? ".png" : ".jpg");
  return source;
}

export async function signOriginal(storage: Db, located: LocatedOriginal) {
  const source = await inspectOriginal(storage, located);
  if (source.issue || !located.path) return { source, url: null };
  const { data, error } = await storage.storage.from("artwork").createSignedUrl(located.path, ORIGINAL_LINK_SECONDS, { download: source.filename });
  if (error || !data) return { source: { ...source, issue: "Could not prepare the private original. Please retry." }, url: null };
  return { source, url: data.signedUrl };
}

export async function campaignOriginals(db: Db, storage: Db, campaignId: string, history = false): Promise<OriginalPlan | null> {
  const edition = await db.from("editions").select("id,zones(name)").eq("id", campaignId).maybeSingle();
  if (edition.error) throw new Error("Could not read campaign.");
  if (!edition.data) return null;
  const bookings = await db.from("bookings").select("id,booking_contacts(business_name),booking_artwork(id)").eq("edition_id", campaignId).order("id").limit(501);
  if (bookings.error) throw new Error("Could not read campaign advertisers.");
  if (bookings.data.length > 500) throw new Error("Campaign has too many records for a browser backup. Use individual downloads or the owner's retained-source backup.");
  const advertisers = bookings.data.filter(b => b.booking_contacts || b.booking_artwork);
  const sources: OriginalSource[] = [];
  // Sequential checks bound Storage concurrency and never load original bytes into the function.
  for (const booking of advertisers) {
    const located = await locateOriginals(db, booking.id, history) ?? [];
    if (sources.length + located.length > MAX_ARCHIVE_FILES) throw new Error("Campaign exceeds the 100-file archive limit. Try current originals only, or download individually from Advertisers.");
    for (const original of located) sources.push(await inspectOriginal(storage, original));
  }
  return { filename: `Inside914_${safeFilenamePart(edition.data.zones?.name ?? "Campaign")}_Originals.zip`, sources, advertisers: advertisers.length, archiveIssue: archiveIssue(sources) };
}
