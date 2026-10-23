import { describe, expect, test, vi } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/artwork/rules";
import { makeImage } from "./fixtures/images";

vi.mock("server-only", () => ({}));
const { validateImage } = await import("@/lib/artwork/validate-image");

// Real sharp decoding (not mocked): this is the server's authoritative check.
describe("validateImage", () => {
  test("accepts a valid JPG and reports its real size", async () => {
    expect(await validateImage(await makeImage("jpeg", 1200, 800))).toMatchObject({
      ok: true,
      contentType: "image/jpeg",
      width: 1200,
      height: 800,
    });
  });

  test("rejects images exceeding the renderer pixel limit", async () => {
    expect(await validateImage(await makeImage("jpeg", 6400, 6400))).toEqual({ ok: false, reason: "too_many_pixels" });
  });

  test("accepts a valid PNG", async () => {
    expect(await validateImage(await makeImage("png", 640, 640))).toMatchObject({ ok: true, contentType: "image/png" });
  });

  test("rejects other image formats (GIF, WebP)", async () => {
    expect(await validateImage(await makeImage("gif"))).toEqual({ ok: false, reason: "unsupported_type" });
    expect(await validateImage(await makeImage("webp"))).toEqual({ ok: false, reason: "unsupported_type" });
  });

  test("rejects a text file renamed to .jpg", async () => {
    expect(await validateImage(Buffer.from("definitely not a photo"))).toEqual({ ok: false, reason: "unsupported_type" });
  });

  test("rejects a PNG signature followed by garbage", async () => {
    const fake = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2048, 7)]);
    expect(await validateImage(fake)).toEqual({ ok: false, reason: "corrupt" });
  });

  test("rejects a truncated JPEG (upload cut off part-way)", async () => {
    const jpeg = await makeImage("jpeg", 1200, 800);
    expect(await validateImage(jpeg.subarray(0, Math.floor(jpeg.length / 2)))).toEqual({ ok: false, reason: "corrupt" });
  });

  test("rejects an image too small to fill a position", async () => {
    expect(await validateImage(await makeImage("png", 200, 900))).toEqual({ ok: false, reason: "too_small" });
  });

  test("rejects oversized and empty files", async () => {
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_UPLOAD_BYTES)]);
    expect(await validateImage(huge)).toEqual({ ok: false, reason: "too_large" });
    expect(await validateImage(Buffer.alloc(0))).toEqual({ ok: false, reason: "empty" });
  });
});
