---
topic: "developer-tooling"
title: "Developer Tooling & Workflows"
related:
  - claude-code-plugins
  - ai-agent-ecosystem
  - agent-security
sources:
  - raw/agent-plugin-sources-guide.md
last_updated: "2026-07-04"
---

# Developer Tooling & Workflows

## Overview

Claude Code plugins extend developer workflows across the entire software lifecycle — from code review and testing to DevOps, security auditing, and frontend design. The best collections organize agents by workflow category rather than just technology.

## Workflow Categories (from wshobson/agents)

| Category | Examples |
|---|---|
| API Development | REST/GraphQL scaffolding, schema validation |
| Frontend | UI generation, component design, accessibility |
| DevOps | CI/CD pipelines, Docker, Kubernetes |
| Testing | Unit tests, E2E, snapshot testing |
| Security | Vulnerability scanning, code review |
| Data | Database migrations, query optimization |
| Debugging | Error tracing, log analysis, reproduction |

## Notable Toolchains

### PR Review Pipeline (Anthropic Demo)
5 parallel agents for comprehensive code review:
- Correctness, performance, security, style, documentation

### Feature Development (Anthropic Demo)
Explore → Design → Implement → Review workflow

### Browser Automation (ChromeDevTools MCP)
- Navigate, click, type, screenshot
- Debug live pages with DevTools state
- E2E testing without Playwright setup

### Mobile Testing (paddo/claude-tools)
- Appium integration for iOS, Android, React Native, Flutter

### Document Generation (davila7)
- Excel, Word, PowerPoint, PDF generation skills

## Stack-Specific Toolkits

- **Next.js / Vercel** — davila7/claude-code-templates
- **Supabase** — davila7/claude-code-templates
- **Git workflows** — Anthropic demo plugins (commit commands)

## Non-Developer Tools (ComposioHQ)

- Business and marketing skills
- Writing and communication
- Creative media generation
- Productivity automation

## Related Topics

- [Claude Code Plugins](claude-code-plugins.md)
- [AI Agent Ecosystem](ai-agent-ecosystem.md)
- [Agent Security](agent-security.md)
