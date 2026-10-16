import { describe, expect, test } from "vitest";
import {
  adArea,
  checkUpload,
  effectivePpi,
  isCropInside,
  MAX_UPLOAD_BYTES,
  resolutionLevel,
  sniffImageType,
} from "@/lib/artwork/rules";
import { PRINT_SPEC } from "@/lib/print/spec";

const bytes = (...values: number[]) => new Uint8Array(values);
const JPEG_HEAD = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const PNG_HEAD = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

describe("file type detection uses the file's content, not its name", () => {
  test("recognizes JPEG and PNG signatures", () => {
    expect(sniffImageType(JPEG_HEAD)).toBe("image/jpeg");
    expect(sniffImageType(PNG_HEAD)).toBe("image/png");
  });

  test("rejects GIF, PDF, HEIC-like and text content", () => {
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(sniffImageType(bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("hello, this is not an image"))).toBeNull();
    expect(sniffImageType(bytes(0x89, 0x50))).toBeNull(); // truncated signature
  });
});

describe("checkUpload", () => {
  test("accepts a JPEG or PNG within the size limit", () => {
    expect(checkUpload(1000, JPEG_HEAD)).toEqual({ ok: true, type: "image/jpeg" });
    expect(checkUpload(MAX_UPLOAD_BYTES, PNG_HEAD)).toEqual({ ok: true, type: "image/png" });
  });

  test("rejects empty and oversized files before looking at content", () => {
    expect(checkUpload(0, JPEG_HEAD)).toEqual({ ok: false, problem: "empty" });
    expect(checkUpload(MAX_UPLOAD_BYTES + 1, JPEG_HEAD)).toEqual({ ok: false, problem: "too_large" });
  });

  test("rejects unsupported content", () => {
    expect(checkUpload(1000, new TextEncoder().encode("%PDF-1.7"))).toEqual({ ok: false, problem: "unsupported_type" });
  });
});

describe("ad area", () => {
  const f1 = { side: "front" as const, x: 0, y: 3, width: 3.25, height: 3 };
  const f2 = { side: "front" as const, x: 3.25, y: 3, width: 3.25, height: 3 };

  test("a standard ad is its own slot", () => {
    expect(adArea([f1])).toEqual(f1);
  });

  test("a double ad is one area spanning both units", () => {
    expect(adArea([f2, f1])).toEqual({ side: "front", x: 0, y: 3, width: 6.5, height: 3 });
  });
});

describe("resolution", () => {
  test("measures pixels per inch at the printed size, using the tighter direction", () => {
    expect(effectivePpi({ width: 975, height: 900 }, { width: 3.25, height: 3 })).toBe(300);
    expect(effectivePpi({ width: 1950, height: 450 }, { width: 6.5, height: 3 })).toBe(150);
  });

  test("grades against the provisional print spec thresholds", () => {
    expect(PRINT_SPEC.status).toBe("provisional");
    expect(resolutionLevel(PRINT_SPEC.recommendedPpi)).toBe("good");
    expect(resolutionLevel(PRINT_SPEC.recommendedPpi - 1)).toBe("low");
    expect(resolutionLevel(PRINT_SPEC.minimumPpi - 1)).toBe("poor");
  });
});

describe("crop bounds", () => {
  const image = { width: 1000, height: 800 };

  test("accepts a crop inside the image (with a pixel of rounding)", () => {
    expect(isCropInside({ x: 0, y: 0, width: 1000, height: 800 }, image)).toBe(true);
    expect(isCropInside({ x: 1, y: 1, width: 1000, height: 800 }, image)).toBe(true);
  });

  test("rejects crops outside the image or with no size", () => {
    expect(isCropInside({ x: -5, y: 0, width: 100, height: 100 }, image)).toBe(false);
    expect(isCropInside({ x: 950, y: 0, width: 100, height: 100 }, image)).toBe(false);
    expect(isCropInside({ x: 0, y: 0, width: 0, height: 100 }, image)).toBe(false);
  });
});
