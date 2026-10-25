import { MAX_ARCHIVE_BYTES, MAX_ARCHIVE_FILES, MAX_ORIGINAL_BYTES, originalEndpoint, type OriginalSource } from "./original-types";

// Read stored dimensions only; never rotate, crop, decode/re-encode or upscale source bytes.
export function sourceDimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v) && String.fromCharCode(...bytes.slice(12,16)) === "IHDR") return { width: view.getUint32(16), height: view.getUint32(20), mime: "image/png" };
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 8) return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5), mime: "image/jpeg" };
      offset += length;
    }
  }
  throw new Error("The source is not a readable original PNG or JPEG. No substitute was saved.");
}

export async function verifyOriginal(bytes: Uint8Array<ArrayBuffer>, source: OriginalSource) {
  if (!bytes.length || bytes.length > MAX_ORIGINAL_BYTES || (source.bytes !== null && bytes.length !== source.bytes)) throw new Error("Original byte size does not match. Nothing was saved.");
  const dimensions = sourceDimensions(bytes);
  if (!dimensions.width || !dimensions.height || (source.mime && dimensions.mime !== source.mime) || (source.width && dimensions.width !== source.width) || (source.height && dimensions.height !== source.height)) throw new Error("Original dimensions or type do not match. Nothing was saved.");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  if (source.knownSha256 && sha256 !== source.knownSha256) throw new Error("Original checksum does not match its recorded source hash. Nothing was saved.");
  return { ...dimensions, sha256, size: bytes.length };
}

export async function fetchOriginal(source: OriginalSource) {
  const prepared = await fetch(originalEndpoint(source), { cache: "no-store", credentials: "same-origin", referrerPolicy: "no-referrer", redirect: "error" });
  const result = await prepared.json();
  if (!prepared.ok || !result.url) throw new Error(result.source?.issue ?? result.error ?? "Original unavailable. Reload and retry.");
  // Fresh authorization per file; source bytes go directly from private Storage to the browser.
  const response = await fetch(result.url, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" });
  if (!response.ok || !response.body) throw new Error("Private link expired or source unavailable. Retry to get a new link.");
  const reader = response.body.getReader(), parts: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ORIGINAL_BYTES || (source.bytes !== null && size > source.bytes)) throw new Error("Original exceeds its expected size. Nothing was saved.");
      parts.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
  return { bytes, ...await verifyOriginal(bytes, source) };
}

export function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = filename; link.referrerPolicy = "no-referrer";
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ZIP STORE: source bytes are uncompressed and unchanged. Blob parts avoid a second full
// archive buffer. ZIP64 is unnecessary within the explicit 100 MB / 100-source bound.
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff; for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0;
}
export class OriginalZip {
  private parts: BlobPart[] = [];
  private directory: BlobPart[] = [];
  private names = new Set<string>();
  private offset = 0;
  private directorySize = 0;
  private sourceBytes = 0;
  add(name: string, bytes: Uint8Array<ArrayBuffer>) {
    if (!/^[a-zA-Z0-9_-]+\.(png|jpg|csv|txt)$/.test(name) || this.names.has(name)) throw new Error("Unsafe or duplicate ZIP filename.");
    if (this.names.size >= MAX_ARCHIVE_FILES + 2 || this.sourceBytes + bytes.length > MAX_ARCHIVE_BYTES + 1024 * 1024) throw new Error("Archive exceeds the browser limit. Download originals individually.");
    this.names.add(name); this.sourceBytes += bytes.length;
    const filename = new TextEncoder().encode(name), crc = crc32(bytes);
    const local = new Uint8Array(30), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(12, 33, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, bytes.length, true); lv.setUint32(22, bytes.length, true); lv.setUint16(26, filename.length, true);
    this.parts.push(local, filename, new Blob([bytes]));
    const central = new Uint8Array(46), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(14, 33, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true); cv.setUint16(28, filename.length, true); cv.setUint32(42, this.offset, true);
    this.directory.push(central, filename); this.directorySize += central.length + filename.length;
    this.offset += local.length + filename.length + bytes.length;
  }
  finish() {
    const end = new Uint8Array(22), view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true); view.setUint16(8, this.names.size, true); view.setUint16(10, this.names.size, true);
    view.setUint32(12, this.directorySize, true); view.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...this.directory, end], { type: "application/zip" });
  }
}

export type ManifestEntry = { source: OriginalSource; sha256?: string; filename?: string; width?: number; height?: number; mime?: string; size?: number; error?: string };
export function originalManifest(rows: ManifestEntry[]) {
  // CSV quoting alone does not prevent spreadsheet formula injection.
  const cell = (value: unknown) => { const s = String(value ?? ""); return `"${(/^[\s]*[=+@-]/.test(s) ? "'" : "") + s.replaceAll('"', '""')}"`; };
  const data = [["booking_id", "reference", "campaign", "zone", "business", "position", "file_name", "width_px", "height_px", "mime_type", "byte_size", "sha256", "artwork_status", "source_version", "result"],
    ...rows.map(r => [r.source.bookingId, r.source.reference, r.source.campaign, r.source.zone, r.source.business, r.source.position, r.filename ?? "", r.width ?? r.source.width, r.height ?? r.source.height, r.mime ?? r.source.mime, r.size ?? r.source.bytes, r.sha256 ?? "", r.source.review, r.source.kind, r.error ?? "verified"])];
  return new TextEncoder().encode(data.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n");
}
