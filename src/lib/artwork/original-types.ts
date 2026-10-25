// Download metadata only. Never include tokens, contacts, payment IDs or Storage paths.
export const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
export const MAX_ARCHIVE_FILES = 100;
export type OriginalSource = {
  bookingId: string; reference: string; business: string; campaign: string; zone: string;
  position: string; version: string; kind: "current" | "historical";
  filename: string; width: number | null; height: number | null;
  mime: string | null; bytes: number | null; uploadedAt: string | null;
  review: string; knownSha256: string | null; issue: string | null;
};
export type OriginalPlan = { filename: string; sources: OriginalSource[]; advertisers: number; archiveIssue: string | null };

export function safeFilenamePart(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "Advertiser";
}

export function archiveIssue(sources: OriginalSource[]) {
  if (sources.length > MAX_ARCHIVE_FILES || sources.reduce((sum, s) => sum + (s.bytes ?? 0), 0) > MAX_ARCHIVE_BYTES) {
    return "This archive exceeds the 100 MB / 100-file browser limit. Download the originals individually below; no archive has been created.";
  }
  return null;
}

export const originalEndpoint = (source: Pick<OriginalSource, "bookingId" | "version" | "kind">) =>
  `/admin/artwork/${source.bookingId}/original?version=${source.version}&history=${source.kind === "historical" ? "1" : "0"}`;
