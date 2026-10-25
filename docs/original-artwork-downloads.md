# Original artwork downloads — Phase 8.1

Admins can download the unchanged current PNG/JPEG from an advertiser or artwork detail page. Campaigns now have an Artwork Backup section with current originals, optional retained historical originals, individual downloads, and a ZIP with a CSV manifest.

## Authorization and integrity

- Each endpoint calls `requireAdmin()` before reading records. Booking and campaign discovery uses the signed-in admin's RLS client. Customer capability cookies do not authorize these routes.
- Current sources come from `booking_artwork`; historical sources must belong to the same booking in the retained `artwork_uploads` ledger. A supplied version must match that association. No caller-supplied Storage path is accepted.
- Private Storage signing happens only after authorization and association checks. Links expire after 120 seconds, request an attachment filename, and apply no image transformation. Metadata responses are private/no-store/no-referrer/noindex.
- The browser reads bytes directly from Storage, checks MIME, byte size and stored dimensions, computes SHA-256, and compares a previously recorded source hash when one exists. Legacy records without a hash receive a newly measured checksum, not a claim of historical verification.
- PNG transparency, JPEG encoding, resolution, aspect ratio and all original bytes are preserved. Crop settings and review state are never changed. Downloading does not improve image quality or approve printing.
- Generated filenames are safe and unique. CSV fields are quoted and guarded against spreadsheet formula injection. Manifests exclude contacts, payment identifiers, Storage paths, signed URLs and recovery tokens.

## Limits and incomplete archives

Vercel Functions have a 4.5 MB request/response limit; original files and ZIP bytes therefore never pass through a Next.js function. The server returns small metadata and fresh private links. The browser assembles a ZIP using uncompressed STORE entries, without a new dependency or image decoding/re-encoding.

The existing bucket permits files up to 20 MiB. The browser ZIP is bounded to 100 MiB of sources and 100 source files, with limited metadata overhead. Files are retrieved sequentially; ZIP Blob parts avoid concatenating another full archive buffer. Larger backups must use individual downloads or the owner's existing private backup procedure. This manual export is not a recoverable offsite database/Storage backup.

Missing, mismatched or unreadable sources are never replaced with previews. Available files can be saved in an explicitly `_INCOMPLETE.zip`; the manifest and README identify each unavailable source. A stale page cannot retrieve a different booking's file by swapping a version. Reload after artwork changes. Historical versions only include retained ledger associations; this feature cannot recover already missing originals or invent metadata absent from legacy records. "Source recorded" is the stored record timestamp, which may be a retention backfill timestamp.

## Verification

Use `node scripts/verify-local-mvp.mjs <script>` for typecheck, lint, test, test:integration, test:e2e and build. It supplies isolated local Supabase settings and blanks real provider keys. Run database and browser suites sequentially. Public production checks use the explicitly allowed GET-only invocation `npm run test:seo -- https://inside914.vercel.app --production`.

Coverage includes exact source checksums, PNG/JPEG, transparency, high resolution, a source larger than Vercel's response limit, crops, historical associations, missing sources, expiry, unauthorized customers, RLS, cancellation, released reservations, manifest/ZIP validation with Python's independent ZIP reader, and admin layouts at 320/375/1440 px. Tests snapshot artwork records before/after downloads. No real customer file is a test fixture.

Local results: 508 unit tests passed; 191 integration tests passed and three unavailable-Stripe-test-credential cases were skipped; 41 E2E tests passed. Typecheck and lint passed. The first E2E run had the previously documented intermittent house-editor error after a full-page screenshot (40 passed, one failed); the isolated diagnostic rerun and complete traced rerun passed. No house-editor source was changed, and this release does not claim to fix that intermittent issue.

The production build and local production-build SEO crawler passed: all six marketing pages and 157 internal link/asset references, sitemap, robots, social image, canonicals, structured data, private indexing controls and checkout gate. The prior Phase 8 lab LCP results remain approximately 2.62–2.77 seconds (slightly above the 2.5-second target); this release does not claim new field performance measurements.

## Release and rollback

SEO PR #18 merged as `120ee09bc9b715dc075f0a55ee6281ce4ef0f489`. The production sitemap/robots were absent because the SEO source had not been deployed; both returned 404 before this release. The artwork feature starts from that merge. Automatic deployments remain disabled for main and both release branches; deploy the final combined main SHA only after verification.

The read-only production audit matched all 45 migration names and SQL hashes; this feature requires no migration or policy change. Preserve all production records, private buckets, and `PUBLIC_CHECKOUT_RELEASED=false`, `LIVE_COLLECTION_RELEASED=false`, `INVITATION_EMAIL_RELEASED=false`, `INSIDE914_COLLECTION_MODE=disabled`.

Prior production rollback target: `dpl_6rHRN94L6MVxk6aKUiofvkEUi49Y`, commit `78bae7e1ffd3ccb096e7ff18fffe3c1a28d86e40`. A rollback is an application promotion only; there is no database rollback for this release. After deployment verify the alias SHA, live SEO endpoints, authenticated source downloads, ZIP manifests and unchanged record digests. Keep private downloads outside Git, logs and public artifacts. The owner submits the sitemap to Google after ownership verification; this release does not submit it or claim indexing.

References: [Vercel function limits](https://vercel.com/docs/functions/limitations), [Supabase private signed downloads](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl).
