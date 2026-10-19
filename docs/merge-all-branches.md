# Merge of all Inside914 branches into local main

The fetched remote branches are all ancestors of origin/task-15-8/stabilization (d2a246a). That branch was merged into local main, followed by restore-infrastructure-review (068ce57), preserving all branch history. No branch was deleted, no remote push was performed, and no deployment or production migration was run.

Conflicts in CLAUDE.md, Playwright configuration, dev-only guards and integration setup were resolved with the new production project reference and local-only test protections retained. Existing changes from later feature branches were preserved. Three test fixtures/assertions were brought into agreement with merged behavior: print approval requires full sellable inventory; deadline tests use their own zone so the seeded open campaign does not block reopening; not-found pages use the new branded heading.

Validation:

- TypeScript: passed (old generated route cache moved aside after demo routes were removed).
- ESLint: passed.
- Unit tests: 221 passed, no skips.
- Production webpack build: passed.
- Local integration: 82 passed, 4 real-Stripe tests skipped because test credentials are absent.
- Local Chromium E2E: 22 passed, 2 failed, 1 real-Stripe test skipped.
- Both browser failures reproduce the existing /admin/payments mobile overflow: 21 pixels at a 375-pixel viewport. No layout behavior was changed in this merge.

Two additional migrations from the merged branches were applied only to the isolated local stack for verification:

1. 20261018131308_cancellation_notice_and_card_removal.sql
2. 20261018133505_campaign_deadlines.sql

Production still has only the ten migrations explicitly approved earlier. Do not deploy this merged code until these two additional migrations have been separately reviewed and approved for production, and the existing production history mapping has been reconciled for the chosen migration workflow. Vercel configuration also remains incomplete (server secret was handed off to the owner; Preview infrastructure is pending). Verify current readiness before any deployment.

Pushing main triggers Vercel production deployment. The prior no-deploy boundary was retained. Explicit authorization for that push/deployment is still required under CLAUDE.md and the conversation's stop-before-deploy instruction.
