# Inside914

Self-service direct-mail advertising platform. Stack: Next.js (App Router), TypeScript (strict), Supabase (Postgres, Auth, Storage, RLS), Stripe, Vercel.

## Commands
Node 24 lives in `~/.local/node/bin`. Prefix commands with `PATH="$HOME/.local/node/bin:$PATH"`.
- `npm run dev`: dev server on :3000
- `npm run typecheck`: `next typegen && tsc --noEmit`
- `npm run lint` · `npm test` (Vitest, `tests/`) · `npm run test:e2e` (Playwright, `e2e/`)
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

## Requires my explicit approval in chat
- Deploying (Vercel CLI or MCP), pushing to a remote, running migrations against a remote Supabase project, any Stripe write.
- Destructive commands: `rm -rf`, `git reset --hard`, force push, `supabase db reset`, dropping tables or data.
- Changing model provider or OmniRoute routing; installing plugins, hooks or MCP servers; editing global (`~/.claude`) config.
- Unattended / auto-run modes or scheduled tasks.

## Tools
- Engineering practices: Agent Skills (spec, planning, incremental-implementation, test-driven-development, security-and-hardening). Code review: `agent-skills:review` only.
- Orchestration: built-in plan mode and subagents. No Oh My ClaudeCode.
- Ponytail: only when I say "ponytail".
- Graphify: only when I run `/graphify`.
