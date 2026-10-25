// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { makeImage } from "./fixtures/images";
import { archiveIssue, MAX_ARCHIVE_BYTES, MAX_ORIGINAL_BYTES, safeFilenamePart, type OriginalSource } from "@/lib/artwork/original-types";
import { crc32, fetchOriginal, OriginalZip, originalManifest, sourceDimensions, verifyOriginal } from "@/lib/artwork/original-archive";
export const source: OriginalSource = { bookingId: "00000000-0000-4000-8000-000000000001", reference: "TEST-1", campaign: "Fixture", zone: "Central", business: "Test business", position: "F1", version: "a".repeat(64), kind: "current", filename: "Test_Original.png", width: 1200, height: 900, mime: "image/png", bytes: null, uploadedAt: null, review: "pending", knownSha256: null, issue: null };
afterEach(() => vi.unstubAllGlobals());

test.each(["png", "jpeg"] as const)("original %s retains exact bytes, dimensions and SHA-256", async format => {
  const bytes = new Uint8Array(await makeImage(format, 1200, 900));
  const hash = createHash("sha256").update(bytes).digest("hex");
  expect(await verifyOriginal(bytes, { ...source, mime: `image/${format}`, bytes: bytes.length, knownSha256: hash })).toEqual({ width: 1200, height: 900, mime: `image/${format}`, sha256: hash, size: bytes.length });
});
test("high-resolution transparent PNG is preserved without upscaling or crop", async () => {
  const bytes = new Uint8Array(await sharp({ create: { width: 5000, height: 4000, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 0.3 } } }).png().toBuffer());
  expect(await verifyOriginal(bytes, { ...source, width: 5000, height: 4000 })).toMatchObject({ width: 5000, height: 4000 });
  expect((await sharp(bytes).metadata()).hasAlpha).toBe(true);
});
test("mismatched size, hash, dimensions and type fail closed", async () => {
  const bytes = new Uint8Array(await makeImage("png", 1200, 900));
  for (const changed of [{ bytes: 1 }, { knownSha256: "0".repeat(64) }, { width: 100 }, { mime: "image/jpeg" }]) await expect(verifyOriginal(bytes, { ...source, ...changed })).rejects.toThrow();
  expect(() => sourceDimensions(new Uint8Array([255,216,255,192,255]))).toThrow();
  await expect(verifyOriginal(new Uint8Array(MAX_ORIGINAL_BYTES + 1), source)).rejects.toThrow(/size/);
});
test("ZIP opens with an independent Python reader and preserves each source and manifest", async () => {
  const bytes = new Uint8Array(await makeImage("png", 1200, 900)), zip = new OriginalZip();
  const verified = await verifyOriginal(bytes, source);
  zip.add(source.filename, bytes); zip.add("manifest.csv", originalManifest([{ source, ...verified, filename: source.filename }]));
  const result = JSON.parse(execFileSync("python3", ["-c", "import sys,io,zipfile,json,hashlib; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps({'names':z.namelist(),'bad':z.testzip(),'sha256':hashlib.sha256(z.read('Test_Original.png')).hexdigest(),'manifest':z.read('manifest.csv').decode()}))"], { input: Buffer.from(await zip.finish().arrayBuffer()), encoding: "utf8" }));
  expect(result.names).toEqual([source.filename, "manifest.csv"]); expect(result.bad).toBeNull(); expect(result.sha256).toBe(verified.sha256); expect(result.manifest).toContain(verified.sha256);
  expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
});
test("ZIP rejects traversal and collisions; generated names and CSV cells are safe", () => {
  const zip = new OriginalZip(), bytes = new Uint8Array([1,2,3]);
  for (const name of ["../secret.png", "a/b.jpg", "a\\b.png", "bad\r\n.png"]) expect(() => zip.add(name, bytes)).toThrow();
  zip.add("a.png", bytes); expect(() => zip.add("a.png", bytes)).toThrow(/duplicate/);
  expect(safeFilenamePart('../hello\r\n".png')).toBe("hello-png");
  const csv = new TextDecoder().decode(originalManifest([{ source: { ...source, business: '=HYPERLINK("bad")' }, error: "Missing" }]));
  expect(csv).toContain("'=HYPERLINK"); expect(csv).toContain('"Missing"'); expect(csv).not.toContain("stripe");
});
test("oversized archives offer individual downloads", () => {
  expect(archiveIssue([{ ...source, bytes: MAX_ARCHIVE_BYTES + 1 }])).toMatch(/individually/);
  expect(archiveIssue(Array.from({ length: 101 }, () => source))).toMatch(/100-file/);
  expect(archiveIssue([source])).toBeNull();
});
test("expired private links fail safely, with no transform, referrer or credential forwarding", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ url: "https://fixture.invalid/signed", source })).mockResolvedValueOnce(new Response("expired", { status: 403 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(fetchOriginal(source)).rejects.toThrow(/expired/);
  expect(fetcher.mock.calls[1][1]).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
});
test("bounded streaming rejects a file exceeding its recorded size before saving", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ url: "https://fixture.invalid/signed", source })).mockResolvedValueOnce(new Response(new Uint8Array(100))));
  await expect(fetchOriginal({ ...source, bytes: 10 })).rejects.toThrow(/expected size/);
});
