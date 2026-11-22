---
topic: "claude-code-plugins"
title: "Claude Code Plugins & Marketplaces"
related:
  - ai-agent-ecosystem
  - developer-tooling
  - agent-security
  - supply-chain-trust
sources:
  - raw/agent-plugin-sources-guide.md
last_updated: "2026-07-04"
---

# Claude Code Plugins & Marketplaces

## Overview

Claude Code uses a **plugin marketplace** system for extending agent capabilities. Plugins are discovered, installed, and managed through the `/plugin` command or CLI.

## Installation Methods

1. **Plugin Marketplace** (recommended): `claude plugin marketplace add <owner>/<repo>`
2. **Git Clone** (manual): Clone repo, copy `.md` agent files to `~/.claude/agents/`
3. **npx CLI** (third-party): `npx claude-plugins install <plugin>` — adds supply chain risk

## Key Marketplaces

### Official (Anthropic)
- **claude-plugins-official** — Auto-ships with Claude Code (LSP, Context7, partners)
- **anthropics/claude-code** — Demo plugins (PR review, security, frontend design)
- **anthropics/skills** — 15,600+ stars, auto-loaded context skills

### Trusted Community
- **wshobson/agents** — 73 plugins, 87+ agents (most comprehensive)
- **VoltAgent/awesome-claude-code-subagents** — 100+ agents with interactive install
- **davila7/claude-code-templates** — 11,100+ stars, stack-specific toolkits
- **obra/superpowers** — 14 curated workflow skills
- **ChromeDevTools/chrome-devtools-mcp** — 13,900+ stars, browser automation
- **ComposioHQ/awesome-claude-skills** — 11,400+ stars, business/marketing skills

### Community
- CC Commands Directory, SkillsMP, Build with Claude, paddo/claude-tools

## Plugin File Format

Plugins use `.md` files with YAML frontmatter specifying:
- `tools:` — permissions (Read, Write, Edit, Bash, Glob, Grep)
- `model:` — which Claude model to use
- Instructions in the markdown body

## Best Practices

- Run `/context` after installing to confirm load and token cost
- Review `tools:` list before using any agent
- Prefer Sonnet over Opus unless complex reasoning is required
- Start with Official + Trusted tiers (covers 95% of needs)

## Related Topics

- [AI Agent Ecosystem](ai-agent-ecosystem.md)
- [Agent Security](agent-security.md)
- [Supply Chain Trust](supply-chain-trust.md)
- [Developer Tooling](developer-tooling.md)
