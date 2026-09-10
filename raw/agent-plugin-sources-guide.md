---
title: "Agent Plugin Sources Guide"
source: "Vibe Coding Incubator / Automated Marketer — February 2026"
date_processed: "2026-07-04"
entities:
  - Anthropic
  - Claude Code
  - VoltAgent
  - Seth Hobson (wshobson)
  - davila7
  - Jesse Obra
  - ChromeDevTools
  - ComposioHQ
  - CC Commands Directory
  - SkillsMP
  - Build with Claude
  - paddo
  - affaan-m
  - Chat2AnyLLM
concepts:
  - Plugin marketplace architecture
  - Agent trust tiers (Official → Trusted → Community → Caution)
  - Supply chain security for AI agents
  - Claude Code plugin installation methods (marketplace, git clone, npx)
  - Agent safety checklist (tools review, model cost, sandboxing)
  - Subagent specialization (code review, security, frontend, DevOps)
claims:
  - "Anthropic Official Marketplace auto-ships with Claude Code — no setup required"
  - "wshobson/agents is the most comprehensive community marketplace (73 plugins, 87+ agents)"
  - "VoltAgent has 100+ specialized subagent definitions with interactive install"
  - "davila7/claude-code-templates has 11,100+ GitHub stars and updates weekly"
  - "npx claude-plugins CLI is third-party, not made by Anthropic — adds supply chain risk"
  - "Skills (SKILL.md) work across both Claude Code and OpenAI Codex CLI"
  - "Never install agents with Bash tool access without reading instructions first"
  - "Anthropic skills repo has 15,600+ GitHub stars"
topics:
  - claude-code-plugins
  - agent-security
  - ai-agent-ecosystem
  - supply-chain-trust
  - developer-tooling
---

# Agent Plugin Sources Guide

A Trusted Source Guide for VCI Students — Ranked from Most Trusted to Use With Caution.

**Source:** Vibe Coding Incubator | Automated Marketer | February 2026

---

## Trust Level Key

| Trust Level | What It Means | Should You Use It? |
|---|---|---|
| OFFICIAL | Maintained by Anthropic. Vetted, documented, supported. | Yes — install with confidence |
| TRUSTED | Well-known repos with high stars, active maintenance, community vetting. | Yes — review agent tools list before using |
| COMMUNITY | Community-contributed. Open source, popular, not formally audited. | Yes, with review — check instructions and permissions |
| USE CAUTION | Newer, less-tested, or aggregators from multiple sources. | Test in non-production first |

---

## What to Check Before Installing Any Agent

- **Tools list** — What permissions does this agent have? (Read, Write, Bash, etc.)
- **Instructions** — What is the agent told to do? Read the markdown body.
- **Model assignment** — Is it using Opus (expensive) or Sonnet (cheaper)?
- **Last updated** — Is this repo actively maintained?
- **GitHub stars & issues** — Community adoption is a signal of quality.

**TIP:** After installing any plugin or agent, run `/context` in Claude Code to confirm it loaded correctly and check how many tokens it consumes.

---

## Installation Methods

### Method 1: Plugin Marketplace (Recommended)

```bash
claude plugin marketplace add anthropics/claude-code
/plugin → Discover tab → Select → Install
claude plugin install <plugin-name>@<marketplace-name>
```

### Method 2: Git Clone (Manual)

```bash
git clone https://github.com/VoltAgent/awesome-claude-code-subagents.git
cp agents/code-reviewer.md ~/.claude/agents/
```

### Method 3: npx CLI (Quick Install)

```bash
npx claude-plugins install @anthropics/claude-code-plugins/frontend-design
```

**WARNING:** npx CLI (claude-plugins.dev) is third-party. Use official `/plugin` command when possible.

---

## Tier 1: Official (Anthropic-Maintained)

### Anthropic Official Marketplace (claude-plugins-official)
- URL: github.com/anthropics/claude-plugins-official
- Auto-available with Claude Code
- LSP plugins for TypeScript, Python, Go, Rust
- Context7 — live, version-specific library docs
- Partner plugins from Vercel, Supabase

### Anthropic Demo Plugins (claude-code-plugins)
- URL: github.com/anthropics/claude-code
- `claude plugin marketplace add anthropics/claude-code`
- PR review toolkit — 5 parallel agents
- Feature dev: explore → design → implement → review
- Security guidance, frontend design, commit commands

### Anthropic Skills
- URL: github.com/anthropics/skills
- `claude plugin marketplace add anthropics/skills`
- 15,600+ GitHub stars
- Auto-loaded context that shapes task approach

---

## Tier 2: Trusted Community Sources

### Seth Hobson (wshobson/agents)
- `claude plugin marketplace add wshobson/agents`
- 73 plugins, 87+ specialized agents, 44 tools
- Categories: API dev, frontend, DevOps, testing, security, data, debugging
- Most comprehensive community collection

### VoltAgent Awesome Subagents
- `claude plugin marketplace add VoltAgent/awesome-claude-code-subagents`
- 100+ specialized subagent definitions
- Interactive install script (./install-agents.sh)
- Categories: core, frontend, backend, DevOps, data, docs, research

### davila7 Claude Code Templates
- `claude plugin marketplace add davila7/claude-code-templates`
- 11,100+ GitHub stars, updated weekly
- Stack-specific: Supabase, Next.js, Vercel
- Document skills: Excel, Word, PowerPoint, PDF

### Jesse Obra's Superpowers
- `claude plugin marketplace add obra/superpowers`
- 14 curated workflow skills
- Focus on methodology and best practices
- MIT licensed

### ChromeDevTools MCP
- `claude plugin marketplace add ChromeDevTools/chrome-devtools-mcp`
- 13,900+ stars
- Browser automation: navigate, click, type, screenshot
- Debug live pages with DevTools state

### Composio Awesome Claude Skills
- `claude plugin marketplace add ComposioHQ/awesome-claude-skills`
- 11,400+ stars
- Business, marketing, communication, writing, creative media
- Particularly useful for non-developer use cases

---

## Tier 3: Community-Recommended

### CC Commands Directory
- `claude plugin marketplace add ananddtyagi/cc-marketplace`
- Community-driven, anyone can submit
- Auto-syncs from live database
- Browse at claudecodecommands.directory

### SkillsMP (Agent Skills Marketplace)
- Browse at skillsmp.com, then git clone skills
- Skills work across Claude Code AND Codex CLI
- Web UI for discovery

### Build with Claude
- Browse at buildwithclaude.com/marketplaces
- Directory of marketplaces (meta-index)
- Shows star counts and install commands

### paddo/claude-tools
- `claude plugin marketplace add paddo/claude-tools`
- Gemini visual analysis, Playwright browser automation
- Appium mobile testing, DNS management, Miro boards

### affaan-m/everything-claude-code
- Full config collection from Anthropic hackathon winner
- Agents, skills, hooks, commands, MCP configs

### Chat2AnyLLM/awesome-claude-plugins
- Curated awesome-list of marketplaces and plugins
- Categorized: vision, OCR, web dev, documentation

---

## Tier 4: Use With Caution

- **claudemarketplaces.com** — Aggregator, doesn't vet plugins
- **claude-plugins.dev (npx CLI)** — Third-party npm package, supply chain risk
- **claudepluginhub.com** — Another aggregator directory
- **Random GitHub Repos** — Search github.com/topics/claude-code-marketplace; always review source code

---

## Safety Checklist

| Check | Why | How |
|---|---|---|
| Read the .md file | Instructions can be malicious | Read YAML frontmatter + body |
| Review tools: list | Bash/Write can modify system | Limit to what's needed |
| Check model: field | Opus costs ~5x more than Sonnet | Use Sonnet when sufficient |
| GitHub stars | High stars = more review | 1,000+ widely tested |
| Last commit date | Stale repos may be broken | Within last 3 months |
| Read open issues | Known bugs/security concerns | Check Issues tab |
| Test in sandbox | Never untested on production | Throwaway project first |
| Run /context | Confirms load + token cost | Type /context after install |

---

## Quick Reference: Top 5 to Start With

| # | Source | Install | What You Get |
|---|---|---|---|
| 1 | Official Marketplace | `/plugin → Discover` | Auto-available. LSP, Context7. |
| 2 | Anthropic Demo Plugins | `marketplace add anthropics/claude-code` | PR review, security, frontend. |
| 3 | wshobson/agents | `marketplace add wshobson/agents` | 73 plugins, 87 agents. |
| 4 | VoltAgent | `marketplace add VoltAgent/awesome-claude-code-subagents` | 100+ agents, interactive installer. |
| 5 | davila7 Templates | `marketplace add davila7/claude-code-templates` | Stack-specific toolkits. |
