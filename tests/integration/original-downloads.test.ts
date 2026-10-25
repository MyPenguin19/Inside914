import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { createOriginalFixture } from "../fixtures/originals";
import { campaignOriginals, locateOriginals, safeStoragePath, signOriginal } from "@/lib/admin/originals";
import { sourceDimensions } from "@/lib/artwork/original-archive";
vi.mock("server-only", () => ({}));
let fixture: Awaited<ReturnType<typeof createOriginalFixture>>;
beforeAll(async () => { fixture = await createOriginalFixture(); });
afterAll(async () => { await fixture?.cleanup(); });

test("admin retrieves the exact current PNG/JPEG, bypassing crops without changing records", async () => {
  const before = await fixture.snapshot();
  for (const [index, bytes] of [fixture.png, fixture.jpeg].entries()) {
    const located = (await locateOriginals(fixture.admin, fixture.bookings[index]))![0];
    const result = await signOriginal(fixture.db, located);
    expect(result.source.issue).toBeNull(); expect(result.url).toBeTruthy(); expect(result.url).not.toContain("render/image");
    const response = await fetch(result.url!); expect(response.ok).toBe(true);
    expect(response.headers.get("content-disposition")).toContain(result.source.filename);
    const downloaded = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(downloaded).equals(bytes)).toBe(true);
    expect(sourceDimensions(downloaded)).toMatchObject({ width: result.source.width, height: result.source.height, mime: result.source.mime });
    expect(createHash("sha256").update(downloaded).digest("hex")).toBe(createHash("sha256").update(bytes).digest("hex"));
  }
  expect(fixture.png.length).toBeGreaterThan(4.5 * 1024 * 1024);
  expect(await fixture.snapshot()).toEqual(before);
});
test("retained historical source is separate, scoped to its booking and still byte-identical", async () => {
  const sources = await locateOriginals(fixture.admin, fixture.bookings[0], true);
  expect(sources).toHaveLength(2);
  const historical = sources!.find(s => s.source.kind === "historical")!;
  expect(historical.path).toBe(fixture.oldPath); expect(historical.source.review).toContain("not current");
  const response = await fetch((await signOriginal(fixture.db, historical)).url!);
  expect(Buffer.from(await response.arrayBuffer()).equals(fixture.historical)).toBe(true);
  expect((await locateOriginals(fixture.admin, fixture.bookings[1], true))!.some(s => s.source.version === historical.source.version)).toBe(false);
});
test("campaign plan contains unique source names, accurate missing file and no payment/contact secrets", async () => {
  const plan = await campaignOriginals(fixture.admin, fixture.db, fixture.campaign, true);
  expect(plan?.advertisers).toBe(3); expect(plan?.sources).toHaveLength(4);
  expect(new Set(plan!.sources.map(s => s.filename)).size).toBe(4);
  expect(plan!.sources.filter(s => s.issue)).toHaveLength(1);
  expect(plan!.sources.find(s => s.bookingId === fixture.bookings[2])?.issue).toMatch(/unavailable/);
  expect(JSON.stringify(plan)).not.toMatch(/stripe|recovery|fixture@example|storage_path|signedUrl|phone/);
  expect(await campaignOriginals(fixture.admin, fixture.db, randomUUID())).toBeNull();
});
test("anonymous RLS cannot discover bookings or originals, and raw private Storage is inaccessible", async () => {
  await expect(locateOriginals(fixture.anon, fixture.bookings[0])).rejects.toThrow(/Could not read/);
  expect((await fixture.anon.storage.from("artwork").download(fixture.currentPath)).data).toBeNull();
  expect((await fixture.db.storage.getBucket("artwork")).data?.public).toBe(false);
  for (const path of ["../file", "x/../y", "/absolute", "a\\b", "a%2fb", "a\nb"]) expect(safeStoragePath(path)).toBe(false);
});
test("expired signed URLs cannot retrieve originals", async () => {
  const signed = await fixture.db.storage.from("artwork").createSignedUrl(fixture.currentPath, -60);
  if (signed.data) expect((await fetch(signed.data.signedUrl)).ok).toBe(false);
  else expect(signed.error).toBeTruthy();
});
test("authenticated non-admin still cannot read source associations or retained history", async () => {
  const email = `original-viewer-${randomUUID()}@example.com`, password = randomUUID() + randomUUID();
  const user = (await fixture.db.auth.admin.createUser({ email, password, email_confirm: true })).data.user!;
  try {
    expect((await fixture.anon.auth.signInWithPassword({ email, password })).error).toBeNull();
    expect(await locateOriginals(fixture.anon, fixture.bookings[0], true)).toBeNull();
    expect((await fixture.anon.from("artwork_uploads").select("id")).data).toEqual([]);
    expect((await fixture.anon.storage.from("artwork").download(fixture.currentPath)).data).toBeNull();
  } finally { await fixture.anon.auth.signOut(); await fixture.db.auth.admin.deleteUser(user.id); }
});
test.each(["released", "cancelled"])("%s reservation leaves retained original available and download never changes approval", async status => {
  expect((await fixture.db.from("bookings").update({ status }).eq("id", fixture.bookings[0])).error).toBeNull();
  const before = await fixture.snapshot();
  const located = (await locateOriginals(fixture.admin, fixture.bookings[0], true))!;
  expect(located).toHaveLength(2);
  expect((await fetch((await signOriginal(fixture.db, located[0])).url!)).ok).toBe(true);
  expect(await fixture.snapshot()).toEqual(before);
});
