---
topic: "ai-agent-ecosystem"
title: "AI Agent Ecosystem"
related:
  - claude-code-plugins
  - developer-tooling
  - agent-security
  - supply-chain-trust
sources:
  - raw/agent-plugin-sources-guide.md
last_updated: "2026-07-04"
---

# AI Agent Ecosystem

## Overview

The Claude Code agent ecosystem is a rapidly growing collection of specialized AI agents, plugins, skills, and marketplaces. As of early 2026, it spans official Anthropic sources, trusted community repos, and a long tail of community-contributed tooling.

## Key Players

### Anthropic (Official)
- Maintains the core plugin marketplace infrastructure
- Ships LSP plugins, Context7, and partner integrations
- Provides demo plugins as reference implementations
- Skills repo (15,600+ stars) for auto-loaded context

### Trusted Community Maintainers
| Maintainer | Repo | Scale |
|---|---|---|
| Seth Hobson | wshobson/agents | 73 plugins, 87+ agents |
| VoltAgent | awesome-claude-code-subagents | 100+ agents |
| davila7 | claude-code-templates | 11,100+ stars |
| Jesse Obra | superpowers | 14 curated skills |
| ChromeDevTools | chrome-devtools-mcp | 13,900+ stars |
| ComposioHQ | awesome-claude-skills | 11,400+ stars |

### Discovery Platforms
- **SkillsMP** (skillsmp.com) — Web marketplace for SKILL.md format
- **Build with Claude** (buildwithclaude.com) — Meta-directory of marketplaces
- **CC Commands Directory** (claudecodecommands.directory) — Community submissions

## Agent Types

- **Subagents** — Specialized workers (code reviewer, debugger, security auditor)
- **Skills** — Context that shapes how Claude approaches tasks (auto-loaded)
- **Plugins** — Packaged tools with marketplace distribution
- **MCP servers** — External tool providers (Chrome DevTools, databases, APIs)

## Ecosystem Trends (2026)

- Convergence of skill formats across Claude Code and OpenAI Codex CLI
- Supply chain security becoming a first-class concern
- Non-developer use cases growing (business, marketing, writing via ComposioHQ)
- Interactive installers reducing friction (VoltAgent's install-agents.sh)

## Related Topics

- [Claude Code Plugins](claude-code-plugins.md)
- [Developer Tooling](developer-tooling.md)
- [Agent Security](agent-security.md)
- [Supply Chain Trust](supply-chain-trust.md)
