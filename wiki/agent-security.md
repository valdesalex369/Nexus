---
topic: "agent-security"
title: "Agent Security & Safety"
related:
  - claude-code-plugins
  - supply-chain-trust
  - ai-agent-ecosystem
sources:
  - raw/agent-plugin-sources-guide.md
last_updated: "2026-07-04"
---

# Agent Security & Safety

## Overview

AI agents with tool access (Bash, Write, network) can execute arbitrary actions on a system. A rigorous safety checklist must be applied before installing or running any agent — regardless of source tier.

## Trust Tier Model

| Tier | Label | Risk Level |
|---|---|---|
| 1 | OFFICIAL (Anthropic-maintained) | Lowest — vetted, documented, supported |
| 2 | TRUSTED (high-star community) | Low — review tools list before using |
| 3 | COMMUNITY (open source, popular) | Medium — check instructions and permissions |
| 4 | USE CAUTION (newer, unaudited) | High — test in sandbox only |

## Safety Checklist (Pre-Install)

1. **Read the agent's .md file** — malicious instructions can cause harm
2. **Review the `tools:` list** — Bash and Write can modify your system
3. **Check the `model:` field** — Opus costs ~5x more than Sonnet
4. **Look at GitHub stars** — 1,000+ stars = widely community-tested
5. **Check last commit date** — stale repos may be broken or vulnerable
6. **Read open issues** — known bugs/security concerns surface here
7. **Test in a sandbox** — never install untested agents on production
8. **Run `/context` after install** — confirms agent loaded correctly

## Critical Rule

> **Never install agents with Bash tool access without reading the instructions first.** A malicious agent with Bash access could run arbitrary commands on your system.

## NEXUS SecurityLayer Integration

NEXUS enforces its own security at the code level via `shared/security.ts`:
- `sanitizeOutput()` scrubs secrets from all outbound messages
- `DataBoundary` restricts per-agent data access
- `installEnvMonitor()` alerts on unauthorized env var access

## Related Topics

- [Claude Code Plugins](claude-code-plugins.md)
- [Supply Chain Trust](supply-chain-trust.md)
- [AI Agent Ecosystem](ai-agent-ecosystem.md)
