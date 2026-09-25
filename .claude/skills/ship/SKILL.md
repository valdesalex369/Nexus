---
name: ship
description: The NEXUS pre-flight discipline for committing and pushing — type-check, secret scan, review staged files, commit with a clean message, push with retry. Use whenever work is ready to leave the machine.
---

# Ship — Operations

Nothing leaves this repo without passing pre-flight. Run these gates in order; a failure at any gate stops the ship.

## Gate 1 — Type check

```bash
npx tsc --noEmit
```

Must be **zero errors**. No exceptions, no `// @ts-ignore` to squeak by.

## Gate 2 — Secret scan

Grep staged changes for anything that looks like a credential:

```bash
git diff --cached | grep -nE "(sk-ant-|sk-[A-Za-z0-9]{20,}|AAAA[A-Za-z0-9]{20,}|0x[a-fA-F0-9]{64}|[0-9]{8,10}:[A-Za-z0-9_-]{35})"
```

Any hit = stop and investigate. Public wallet addresses (0x + 40 hex) are fine; private keys (0x + 64 hex), API keys, and bot tokens are never committed. When touching agents, config, telegram, or memory persistence, run the **security-guardian** subagent for a full audit.

## Gate 3 — Review what's staged

```bash
git status && git diff --cached --stat
```

- No `.env`, no `data/`, no `node_modules/`, no build artifacts
- Every staged file is one you intended to change

## Gate 4 — Commit

One logical change per commit. Message format: imperative summary line, blank line, body explaining what and why (not how).

## Gate 5 — Push

```bash
git push -u origin <branch>
```

On network failure retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s). Confirm with `git status` — working tree clean, branch up to date.
