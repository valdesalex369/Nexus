---
topic: "supply-chain-trust"
title: "Supply Chain Trust for AI Agents"
related:
  - agent-security
  - claude-code-plugins
  - ai-agent-ecosystem
sources:
  - raw/agent-plugin-sources-guide.md
last_updated: "2026-07-04"
---

# Supply Chain Trust for AI Agents

## Overview

Installing an AI agent is equivalent to granting code execution permissions to an external author. Supply chain trust determines how much risk a given source carries — from Anthropic-maintained (lowest risk) to anonymous GitHub repos (highest risk).

## Trust Signals

| Signal | High Trust | Low Trust |
|---|---|---|
| Maintainer | Known org (Anthropic, Google) | Anonymous / new account |
| GitHub stars | 1,000+ | < 50 |
| Last commit | Within 3 months | > 1 year stale |
| Open issues | Actively triaged | Ignored / accumulating |
| License | MIT / Apache 2.0 | None / proprietary |
| Tool scope | Read-only (Glob, Grep) | Full system (Bash, Write) |

## Risk Categories

### Low Risk
- Official Anthropic plugins (auto-available)
- Trusted repos with 10K+ stars (wshobson, davila7, ChromeDevTools)

### Medium Risk
- Community marketplaces (CC Commands, SkillsMP)
- Repos with 100-1000 stars, active maintenance

### High Risk
- **npx CLI tools** (claude-plugins.dev) — adds third-party npm to supply chain
- **Aggregator directories** (claudemarketplaces.com, claudepluginhub.com) — don't vet content
- **Random GitHub repos** from topic searches — may be abandoned or malicious

## Mitigation Strategies

1. **Start with Tier 1-2 only** — covers 95% of needs
2. **Sandbox testing** — never install untested agents on production
3. **Scope tool permissions** — agents should only have tools they need
4. **Pin versions** — don't auto-update from unvetted sources
5. **Review diffs** — when a marketplace updates, check what changed
6. **Prefer marketplace over npx** — official `/plugin` avoids extra dependencies

## Key Claim

> "The npx CLI (claude-plugins.dev) is a third-party tool, not made by Anthropic. It adds another dependency to your toolchain. Use the official /plugin command when possible."

## Related Topics

- [Agent Security](agent-security.md)
- [Claude Code Plugins](claude-code-plugins.md)
- [AI Agent Ecosystem](ai-agent-ecosystem.md)
