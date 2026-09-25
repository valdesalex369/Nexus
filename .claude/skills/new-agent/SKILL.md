---
name: new-agent
description: Scaffold a new NEXUS or HERMES agent with every codebase convention wired in — types, fallback, config, pipeline registration, security boundaries. Use when adding a new data source, intelligence domain, or trading capability.
---

# New Agent — Engineering

Adding an agent touches six places. Miss one and the pipeline silently ignores your work.

## Decide the home

- **NEXUS agent** (trading pipeline): extends `BaseAgent` in `agents/`, orchestrated by `agents/HubAgent.ts`
- **HERMES agent** (intelligence pipeline): plain class with `gather(ctx)` + `fallback()` in `hermes/agents/`, orchestrated by `hermes/agents/HermesAgent.ts`
- **Data source client** (shared by agents): `hermes/sources/` — caching + throttling live here, not in agents

## The six-step checklist

1. **Types** — add signal/result interfaces to `shared/types.ts` (NEXUS) or `hermes/shared/hermes-types.ts` (HERMES). Extend the `Signal` base for HERMES domains.
2. **Agent class** — follow the exact pattern of a sibling agent (`MarketAgent.ts` or `AlphaScanner.ts` are the cleanest references). Every external call gets a timeout. Every agent gets a `fallback()` returning safe empties.
3. **Config** — new env vars go in `shared/config.ts` AND `.env.example` with a comment. Agents never read `process.env` directly — the SecurityLayer env monitor flags it.
4. **Pipeline registration** — instantiate in HubAgent or HermesAgent, add to the `Promise.allSettled` array, unwrap with the fallback pattern. Never `Promise.all`.
5. **Security** — if the agent produces outbound strings (Telegram, persistence), they must route through `sanitizeOutput()`. If it reads cross-domain data, register its DataBoundary role.
6. **Verify** — `npx tsc --noEmit` (zero errors), then run the orchestrator once and confirm the new agent's log line appears and its failure degrades gracefully (unplug its API key and re-run).

For complex builds, delegate to the **nexus-builder** subagent — it knows every convention. For signal design questions (scoring, thresholds, decay), consult the **signal-architect** subagent first.
