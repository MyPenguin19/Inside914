# Claude Code environment audit — 2026-10-15

Read-only inspection of `~/.claude`, `~/.claude.json`, `~/.omniroute`, `~/.local/bin`, running processes and listening ports. Nothing global was changed.

## Installed and working

| Tool | Where | State |
|---|---|---|
| Agent Skills (Addy Osmani) v0.6.13 | plugin `agent-skills@addy-agent-skills` (user scope) | Enabled. About 25 skills, 9 commands (`/build`, `/spec`, `/plan`, `/review`, `/ship`, `/test`, …), 4 agents (code-reviewer, security-auditor, test-engineer, web-performance-auditor). Its hook scripts are **not wired** (no `hooks.json`), so they run nothing. |
| Graphify | skill `~/.claude/skills/graphify` + uv tool `graphifyy` 0.9.91 (`~/.local/bin/graphify`, `graphify-mcp`) | Available. Global CLAUDE.md has a `/graphify` trigger. `graphify-mcp` is not registered as an MCP server. |
| Ponytail | 6 standalone skills in `~/.claude/skills/ponytail*` | Prompt-only skills: no hooks, binary or background process. |
| OmniRoute v16.3.5 | `~/.local/lib/node_modules/omniroute`, data in `~/.omniroute` | Daemon running (127.0.0.1:20128, 20131, 20132) with 0 provider connections, 0 combos and 0 API keys. Claude Code is **not** routed through it (`ANTHROPIC_BASE_URL=https://api.anthropic.com`). Left untouched. |
| Oh My ClaudeCode | — | **Not installed**: no plugin, marketplace, `~/.omc` folder or binary. Decision: skip. Use built-in plan mode and subagents. |

MCP connectors in this session (from claude.ai, not local config): Vercel, Stripe, Supabase, Claude Docs, Chrome, scheduled tasks. `~/.claude.json` has no local `mcpServers`. The Vercel, Stripe and Supabase connectors expose write tools (deploy, SQL, migrations, Stripe writes). `.claude/settings.json` now sends these to ask or deny.

## Overlaps and conflicts

- **Three code reviewers:** `agent-skills:review` / `code-reviewer` agent, `ponytail-review`, and built-in `/code-review`. This project uses `agent-skills:review`.
- **Two whole-repo audits:** `ponytail-audit` vs `agent-skills:ship` / `security-auditor` / built-in `/security-review`.
- **Philosophy clash:** Ponytail ("smallest change; tests only for non-trivial logic"; stays on for the session once triggered) vs Agent Skills (spec → plan → TDD). Ponytail's description says to use it "on any coding task", so it can auto-trigger. CLAUDE.md restricts it to explicit use.
- **Simplifiers:** `ponytail`, `agent-skills:code-simplification`, built-in `/simplify`.
- **Graphify:** its skill description claims "any question about a codebase". It's harmless until `graphify-out/` exists. The global CLAUDE.md block repeats what the skill already says (small per-session token cost).
- No conflicting hooks: no user-level or plugin hooks are active.

## Unrelated background processes (not touched)

- Two embedded Postgres servers from `/private/tmp/qrcr-native-runtime` (ports 55457, 55459) and a Python script `/private/tmp/qrcr-backup-credential-setup.py` (port 18793), left over from another project.
- OmniRoute daemon running with nothing configured (schedulers for proxy health and model sync).

## Toolchain gaps for Inside914

Not on Claude Code's PATH: `node`/`npm` (Node exists at `~/.local/node/bin`), `pnpm`, `supabase`, `vercel`, `stripe`, `gh`. `git` 2.39.5 is available.
