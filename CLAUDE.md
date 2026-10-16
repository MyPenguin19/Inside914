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
