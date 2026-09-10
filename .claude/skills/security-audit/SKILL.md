---
name: security-audit
description: Full SecurityLayer audit of the NEXUS codebase — secret scan, sanitizeOutput coverage, DataBoundary compliance, env monitor verification, dependency check. Use before merging, after touching security-sensitive files, or on a schedule.
---

# Security Audit — Security

Run the complete audit via the **security-guardian** subagent, which follows this procedure:

1. **Secret scan** — grep everything for API key patterns, private keys (0x + 64 hex), Telegram tokens, BIP-39 seed phrases
2. **Outbound audit** — trace every exit point (Telegram, HTTP bodies, file writes) and verify `sanitizeOutput()` sits in front of it
3. **DataBoundary check** — each agent's role limits what data domains it reads
4. **Env monitor** — `installEnvMonitor()` active; no agent touches `process.env` directly (all keys flow through `shared/config.ts` exactly once)
5. **Dependency audit** — `npm audit` for known CVEs in the dependency tree
6. **Express surface** — injection vectors in `server/index.ts` routes
7. **Config hygiene** — `.env` gitignored, nothing sensitive in tracked files or git history

## Non-negotiables being verified

- API keys are read once via `shared/config.ts` — never logged, never in Telegram messages, never in `nexus-memory.json`
- No private keys or seed phrases anywhere, ever
- Kalshi live trades and @Xelarocket posts require Telegram `/approve`
- `KALSHI_ENV=demo` until 50+ paper trades

## Output

Findings ranked `[CRITICAL] → [LOW]` with `file:line`, plus a final verdict: **SECURE** or **VIOLATIONS FOUND (n)**. Critical findings get fixed before anything else happens; the fix then re-runs the audit.
