---
title: "NEXUS Knowledge Wiki — Index"
last_updated: "2026-07-04"
total_topics: 5
total_raw_files: 1
---

# NEXUS Knowledge Wiki

Central index for all processed knowledge in the NEXUS platform.

## Topics

| Topic | Title | Sources | Related |
|---|---|---|---|
| [claude-code-plugins](claude-code-plugins.md) | Claude Code Plugins & Marketplaces | agent-plugin-sources-guide | ai-agent-ecosystem, developer-tooling, agent-security, supply-chain-trust |
| [agent-security](agent-security.md) | Agent Security & Safety | agent-plugin-sources-guide | claude-code-plugins, supply-chain-trust, ai-agent-ecosystem |
| [ai-agent-ecosystem](ai-agent-ecosystem.md) | AI Agent Ecosystem | agent-plugin-sources-guide | claude-code-plugins, developer-tooling, agent-security, supply-chain-trust |
| [supply-chain-trust](supply-chain-trust.md) | Supply Chain Trust for AI Agents | agent-plugin-sources-guide | agent-security, claude-code-plugins, ai-agent-ecosystem |
| [developer-tooling](developer-tooling.md) | Developer Tooling & Workflows | agent-plugin-sources-guide | claude-code-plugins, ai-agent-ecosystem, agent-security |

## Processed Raw Files

| File | Title | Topics | Date |
|---|---|---|---|
| [agent-plugin-sources-guide](../raw/agent-plugin-sources-guide.md) | Agent Plugin Sources Guide | claude-code-plugins, agent-security, ai-agent-ecosystem, supply-chain-trust, developer-tooling | 2026-07-04 |

## Topic Graph

```
claude-code-plugins ←→ ai-agent-ecosystem
        ↕                      ↕
  agent-security  ←→  supply-chain-trust
        ↕                      ↕
       developer-tooling ←——→ ↑
```

## How This Wiki Works

1. Raw files land in `raw/` (documents, guides, research)
2. Each raw file gets a YAML header with extracted entities, concepts, claims, sources, and topics
3. Each topic gets a `wiki/{topic}.md` page with synthesized knowledge
4. Topics cross-reference each other via `related:` fields
5. This index tracks all topics and raw files
