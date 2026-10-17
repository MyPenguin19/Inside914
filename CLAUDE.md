# Inside914

Self-service direct-mail advertising platform. Stack: Next.js (App Router), TypeScript (strict), Supabase (Postgres, Auth, Storage, RLS), Stripe, Vercel.

## Commands
Node 24 lives in `~/.local/node/bin`. Prefix commands with `PATH="$HOME/.local/node/bin:$PATH"`.
- `npm run dev`: dev server on :3000
- `npm run typecheck`: `next typegen && tsc --noEmit`
- `npm run lint` · `npm test` (Vitest, `tests/`) · `npm run test:e2e` (Playwright, `e2e/`)
- `npx supabase start` (needs OrbStack/Docker) · `npm run test:integration` (`tests/integration/`, against local stack)
- Remote dev DB: Supabase project `Inside914` (ref `uobiwanrxifqwdnouzxj`, us-west-2). Integration tests: `SUPABASE_URL=https://uobiwanrxifqwdnouzxj.supabase.co SUPABASE_ANON_KEY=<publishable key> npm run test:integration`. After applying a migration via MCP, rename the local file to the version `list_migrations` reports.
- Supabase clients: `@/lib/supabase/browser` (Client Components), `@/lib/supabase/server` (per-request, user/anon, RLS applies), `@/lib/supabase/admin` (secret key, bypasses RLS; server-only, only after authorization). Env is validated lazily in `@/lib/env/*`; see `.env.example`.
- `npm run db:types` regenerates `src/lib/supabase/database.types.ts` after a migration (needs `npx supabase login`; or use the Supabase MCP `generate_typescript_types`).
- Booking model: `bookings` (one customer hold: size, price, status, token hash) + `booking_slots` (live claims, unique per slot). Holds only via `hold_slots()`; double-compatibility is defined only by the `slot_pairs` view. Slot geometry is provisional data, never hardcoded.
- Artwork: private `artwork` bucket, no storage policies; all access via `src/lib/artwork/service.ts` (hold-token authorized). Print geometry/thresholds live only in `src/lib/print/spec.ts` and are PROVISIONAL until the printer's template arrives.
- Checkout: `src/lib/checkout/*`. Stripe is TEST MODE ONLY (the app refuses non-test keys); Task 8 code must never create PaymentIntents, charges, subscriptions or invoices (enforced by `tests/checkout-text.test.ts`). Reservations are confirmed only by `confirm_booking()` after the server re-checks the SetupIntent with Stripe. Emails go through `email_outbox`; reservation links use `booking_access_tokens` (hash only).
- The Stripe MCP connector in this workspace is a LIVE account: do not use it for development.
- Dev TEST reservations: `INSIDE914_DEV_TEST_RESERVATIONS=true` swaps Stripe for `src/lib/dev/fake-stripe.ts` (ids `cus_/seti_/pm_devtest_`), but only when `src/lib/dev/test-mode.ts` allows it (dev build, not on Vercel, dev database). Test bookings are labeled TEST, never emailed, and can't be continued with real Stripe (or vice versa). Clear with `npm run dev:clear-test-reservations`.
- Design system: `src/components/ui/*` (Button/ButtonLink incl. `inverse` for dark cards, Card, SectionHeading, StatusBadge, PriceSummary, Notice, Timeline, DataTable, ProgressSteps, TextField/SelectField); tokens in `globals.css` (no hard-coded hex in components); Fraunces for display headings. Put responsive `hidden`/`sm:block` on a wrapper, never on a Button (its display class wins).
- Layout: `page-width` (one max width + responsive gutters) for header, footer, main and homepage sections; `section-y` for homepage section padding. Both are `@utility` in `globals.css` (use plain `@media` inside, not nested `@variant`, which silently dropped the rule). Booking pages: content left, sticky 340px summary right from `lg`; postcards capped by viewport height without changing their 6.5 x 12 ratio.
- Occupancy: `slot_availability.occupancy` = available | held | reserved | closed (via `private.slot_claim`, no booking data). Hold attempts are rate-limited per visitor (`note_hold_attempt`, HMAC of the client address; `INSIDE914_HOLD_ATTEMPTS_MAX` can only raise the default 10 per 10 min; Playwright sets it high).
- Live areas: `/areas` (Supabase, `src/components/booking/live-areas.tsx`, cards shared with the demo via `area-cards.tsx`). `CAMPAIGN_DETAILS_PROVISIONAL` in `src/lib/catalog/areas.ts` labels the placeholder dev campaign; `PLANNED_AREAS` lists coming-soon areas with no invented details. Homepage CTAs point to `/areas`; the design preview stays at `/demo`.
- Postcard layouts are data: slots plus optional `PostcardZone`s (masthead, mailing panel). Wide screens show front and back side by side; narrow screens use the side toggle and a sticky price/continue bar.
- `/demo/*` is a DESIGN PREVIEW: static sample data (`src/lib/demo/data.ts`) and browser-only state (`components/demo/demo-store.tsx`). It must never call server actions, Supabase, Stripe or Resend (asserted in `e2e/demo.spec.ts`). The homepage CTAs point there until the visual design is approved.
- Integration and e2e tests use the shared dev database: they run one file/worker at a time and clean up their own holds.
- Dev catalog changes that aren't schema go in `supabase/dev-data/` and need approval before running.
- `npx supabase migration new <name>` for schema changes; `npx supabase db reset` (local only) reapplies migrations + seed
- `npm run build`
- Done means `npm run typecheck && npm run lint && npm test` all pass.

## How to work
- Use plan mode for any change touching more than one file; ship in small, verified slices.
- Before saying "done": typecheck, lint and relevant tests pass. Report failures as they are.
- Check official Next.js / Supabase / Stripe docs before using an API you are unsure of. Next.js 16 docs matching the installed version are in `node_modules/next/dist/docs/`.

## Rules
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) are server-only: never in client components or `NEXT_PUBLIC_*`.
- Every table has RLS enabled with explicit policies. Schema changes only as new files in `supabase/migrations/`; never edit an applied migration.
- Validate all input at trust boundaries (server actions, route handlers, webhooks) with zod.
- Stripe: test mode only. Verify webhook signatures, use idempotency keys, store money as integer cents.

## Deploys
- GitHub: `MyPenguin19/Inside914` (private). Push with `~/.local/bin/gh` as credential helper: `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push`.
- Vercel project `inside914` (team `mypenguin19s-projects`, Hobby) is Git-connected: **every push to `main` is a production deploy**; other branches get previews. Vercel CLI: `npx vercel` (logged in locally; the Vercel MCP connector lacks team access).

## Requires my explicit approval in chat
- Deploying (Vercel CLI or MCP), pushing to a remote (a push to `main` deploys production), running migrations against a remote Supabase project, any Stripe write.
- Destructive commands: `rm -rf`, `git reset --hard`, force push, `supabase db reset`, dropping tables or data.
- Changing model provider or OmniRoute routing; installing plugins, hooks or MCP servers; editing global (`~/.claude`) config.
- Unattended / auto-run modes or scheduled tasks.

## Tools
- Engineering practices: Agent Skills (spec, planning, incremental-implementation, test-driven-development, security-and-hardening). Code review: `agent-skills:review` only.
- Orchestration: built-in plan mode and subagents. No Oh My ClaudeCode.
- Ponytail: only when I say "ponytail".
- Graphify: only when I run `/graphify`.
