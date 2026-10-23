import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { makeImage } from "../fixtures/images";
import { assessArtworkQuality } from "@/lib/artwork/review-quality";

vi.mock("server-only", () => ({}));
const { placeHold } = await import("@/lib/booking/place-hold");
const artwork = await import("@/lib/artwork/service");
const { hashHoldToken } = await import("@/lib/booking/hold-token");

const url = process.env.SUPABASE_URL!;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const OPEN_EDITION = "00000000-0000-4000-8000-000000000101";

// REAL Supabase Storage + database (local stack). Needs SUPABASE_SECRET_KEY; cleans up after itself.
describe.skipIf(!secretKey)("artwork storage", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  const ids: Record<string, string> = {};

  // Same request shape the browser helper (uploadToSignedUrl) sends.
  const put = (signedUrl: string, bytes: Buffer, type: string) => {
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", new Blob([new Uint8Array(bytes)], { type }));
    return fetch(signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body });
  };

  async function hold(label: string) {
    const result = await placeHold(admin, { slotIds: [ids[label]] });
    if (!result.ok) throw new Error(`could not hold ${label}: ${result.reason}`);
    return result.token;
  }

  async function uploadAndFinalize(token: string, bytes: Buffer, type = "image/png") {
    const ticket = await artwork.requestUpload(admin, token, { byteSize: bytes.length });
    if (!ticket.ok) return ticket;
    expect((await put(ticket.uploadUrl, bytes, type)).ok).toBe(true);
    return artwork.finalizeUpload(admin, token, { artworkId: ticket.artworkId });
  }

  async function objectsFor(token: string) {
    const { data: booking } = await admin.from("bookings").select("id").eq("hold_token_hash", hashHoldToken(token)).single();
    const { data } = await admin.storage.from("artwork").list(booking!.id);
    return data ?? [];
  }

  beforeAll(async () => {
    admin = createClient<Database>(url, secretKey!, { auth: { persistSession: false } });
    anon = createClient<Database>(url, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data } = await admin.from("slots").select("id, label").eq("edition_id", OPEN_EDITION);
    for (const s of data ?? []) ids[s.label] = s.id;
  });

  afterEach(async () => {
    const { data: rows } = await admin.from("booking_artwork").select("storage_path");
    if (rows?.length) await admin.storage.from("artwork").remove(rows.map((r) => r.storage_path));
    await admin.from("bookings").delete().eq("edition_id", OPEN_EDITION);
  });

  afterAll(async () => {
    await admin?.from("bookings").delete().eq("edition_id", OPEN_EDITION);
  });

  test("valid PNG: signed upload, server verification, private view URL", async () => {
    const token = await hold("F5");
    const result = await uploadAndFinalize(token, await makeImage("png", 1300, 1200));
    expect(result).toMatchObject({ ok: true, artwork: { contentType: "image/png", width: 1300, height: 1200 } });
    if (!result.ok) return;
    expect((await fetch(result.artwork.viewUrl)).status).toBe(200);
  });

  test("valid JPG, then replacing it deletes the old file", async () => {
    const token = await hold("F6");
    const first = await uploadAndFinalize(token, await makeImage("jpeg", 1000, 900), "image/jpeg");
    expect(first.ok).toBe(true);
    const [oldObject] = await objectsFor(token);

    const second = await uploadAndFinalize(token, await makeImage("png", 1000, 900));
    expect(second.ok).toBe(true);
    const names = (await objectsFor(token)).map((o) => o.name);
    expect(names).toHaveLength(1);
    expect(names).not.toContain(oldObject.name);
  });

  test("quality assessment of a saved private crop leaves bytes and review decisions unchanged", async () => {
    const token=await hold("F5");
    const bytes=await makeImage("png",1000,800);
    const upload=await uploadAndFinalize(token,bytes);
    if (!upload.ok) throw new Error("upload");
    expect(await artwork.saveLayout(admin,token,{artworkId:upload.artwork.id,crop:{x:100,y:100,width:495,height:495},zoom:1})).toEqual({ok:true});
    const before=await admin.from("booking_artwork").select("*").eq("id",upload.artwork.id).single();
    expect(before.error).toBeNull();
    const view=await artwork.getArtwork(admin,before.data!.booking_id);
    expect(assessArtworkQuality(view!,view!.crop,{width:2.2925,height:2.815})).toMatchObject({ppi:215,status:"REVIEW"});
    const response=await fetch(view!.viewUrl);
    expect(Buffer.from(await response.arrayBuffer()).equals(bytes)).toBe(true);
    const after=await admin.from("booking_artwork").select("*").eq("id",upload.artwork.id).single();
    expect(after.data).toEqual(before.data);
  });

  test("disguised or broken files are rejected and deleted", async () => {
    const token = await hold("F7");
    expect(await uploadAndFinalize(token, Buffer.from("not an image at all"), "image/png")).toEqual({ ok: false, reason: "unsupported_type" });
    expect(await uploadAndFinalize(token, await makeImage("gif"), "image/png")).toEqual({ ok: false, reason: "unsupported_type" });
    const jpeg = await makeImage("jpeg", 1200, 900);
    expect(await uploadAndFinalize(token, jpeg.subarray(0, jpeg.length / 2), "image/jpeg")).toEqual({ ok: false, reason: "corrupt" });
    expect(await objectsFor(token)).toEqual([]);
  });

  test("oversized files are refused before upload, and the bucket refuses them too", async () => {
    const token = await hold("F8");
    expect(await artwork.requestUpload(admin, token, { byteSize: 21 * 1024 * 1024 })).toEqual({ ok: false, reason: "too_large" });

    const ticket = await artwork.requestUpload(admin, token, { byteSize: 1000 });
    if (!ticket.ok) throw new Error("ticket");
    const tooBig = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(21 * 1024 * 1024)]);
    expect((await put(ticket.uploadUrl, tooBig, "image/jpeg")).ok).toBe(false);
  });

  test("an interrupted upload (nothing arrived) is reported and cleaned up", async () => {
    const token = await hold("B5");
    const ticket = await artwork.requestUpload(admin, token, { byteSize: 5000 });
    if (!ticket.ok) throw new Error("ticket");
    expect(await artwork.finalizeUpload(admin, token, { artworkId: ticket.artworkId })).toEqual({ ok: false, reason: "upload_missing" });
    const { data } = await admin.from("booking_artwork").select("id").eq("id", ticket.artworkId);
    expect(data).toEqual([]);
  });

  test("a signed upload URL works once: it can't overwrite the stored file", async () => {
    const token = await hold("B6");
    const ticket = await artwork.requestUpload(admin, token, { byteSize: 5000 });
    if (!ticket.ok) throw new Error("ticket");
    expect((await put(ticket.uploadUrl, await makeImage("png", 600, 600), "image/png")).ok).toBe(true);
    expect((await put(ticket.uploadUrl, await makeImage("png", 700, 700), "image/png")).ok).toBe(false);
  });

  test("another visitor, or the public, can't reach someone else's artwork", async () => {
    const owner = await hold("B7");
    const result = await uploadAndFinalize(owner, await makeImage("png", 900, 900));
    if (!result.ok) throw new Error("upload");
    const stranger = await hold("B8");

    const crop = { x: 0, y: 0, width: 900, height: 900 };
    expect(await artwork.saveLayout(admin, stranger, { artworkId: result.artwork.id, crop, zoom: 1 })).toEqual({ ok: false, reason: "not_found" });
    expect(await artwork.finalizeUpload(admin, stranger, { artworkId: result.artwork.id })).toEqual({ ok: false, reason: "not_found" });
    expect(await artwork.saveLayout(admin, undefined, { artworkId: result.artwork.id, crop, zoom: 1 })).toEqual({ ok: false, reason: "no_hold" });

    const [object] = await objectsFor(owner);
    const { data: booking } = await admin.from("bookings").select("id").eq("hold_token_hash", hashHoldToken(owner)).single();
    expect((await anon.storage.from("artwork").download(`${booking!.id}/${object.name}`)).data).toBeNull();
    expect((await anon.storage.from("artwork").list(booking!.id)).data ?? []).toEqual([]);
    expect((await anon.from("booking_artwork").select("id")).data ?? []).toEqual([]);
  });

  test("crop is saved only inside the image", async () => {
    const token = await hold("B1");
    const result = await uploadAndFinalize(token, await makeImage("png", 1000, 800));
    if (!result.ok) throw new Error("upload");
    const id = result.artwork.id;
    expect(await artwork.saveLayout(admin, token, { artworkId: id, crop: { x: 100, y: 0, width: 800, height: 738 }, zoom: 1.4 })).toEqual({ ok: true });
    expect(await artwork.saveLayout(admin, token, { artworkId: id, crop: { x: 500, y: 0, width: 800, height: 738 }, zoom: 1 })).toEqual({ ok: false, reason: "invalid_input" });
    expect((await artwork.getArtwork(admin, result.artwork.id ? (await admin.from("booking_artwork").select("booking_id").eq("id", id).single()).data!.booking_id : ""))?.crop).toEqual({ x: 100, y: 0, width: 800, height: 738 });
  });

  test("an expired hold can't upload or save", async () => {
    const token = await hold("B2");
    const result = await uploadAndFinalize(token, await makeImage("png", 900, 900));
    if (!result.ok) throw new Error("upload");
    await admin.from("bookings").update({ hold_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("hold_token_hash", hashHoldToken(token));

    expect(await artwork.requestUpload(admin, token, { byteSize: 1000 })).toEqual({ ok: false, reason: "hold_expired" });
    expect(await artwork.saveLayout(admin, token, { artworkId: result.artwork.id, crop: { x: 0, y: 0, width: 900, height: 900 }, zoom: 1 })).toEqual({ ok: false, reason: "hold_expired" });
  });

  test("hold extension: only in the last 5 minutes, at most twice, never after expiry", async () => {
    const token = await hold("B3");
    const setLeft = (ms: number) =>
      admin.from("bookings").update({ hold_expires_at: new Date(Date.now() + ms).toISOString() }).eq("hold_token_hash", hashHoldToken(token));

    expect(await artwork.extendHold(admin, token)).toEqual({ ok: false, reason: "extension_too_early" });
    for (let i = 0; i < 2; i++) {
      await setLeft(4 * 60_000);
      const extended = await artwork.extendHold(admin, token);
      expect(extended.ok).toBe(true);
      if (extended.ok) expect(Date.parse(extended.expiresAt) - Date.now()).toBeGreaterThan(14 * 60_000);
    }
    await setLeft(4 * 60_000);
    expect(await artwork.extendHold(admin, token)).toEqual({ ok: false, reason: "extension_limit" });

    const other = await hold("B4");
    await admin.from("bookings").update({ hold_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("hold_token_hash", hashHoldToken(other));
    expect(await artwork.extendHold(admin, other)).toEqual({ ok: false, reason: "hold_expired" });
  });
});
