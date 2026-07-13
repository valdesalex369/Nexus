---
name: run-cycle
description: Run a NEXUS trading cycle and/or HERMES intelligence cycle and interpret the output — signal counts, swarm consensus, positions, and what fallback warnings mean. Use when the user says "run a cycle", "test the pipeline", or wants to see the system think.
---

# Run Cycle — Operations

Run one or both pipelines and translate the raw output into a readable readout.

## Commands

```bash
npx ts-node agents/HubAgent.ts             # NEXUS trading cycle (10 steps)
npx ts-node hermes/agents/HermesAgent.ts   # HERMES intelligence cycle (8 steps)
```

## How to interpret output

1. **Signal counts per domain** — zeros mean that domain's source failed or has no API key. Check which tier fired: `[WorldMonitor] N events via <path>` (tier 1), `[GeopoliticalAgent] N headlines from GDELT` (tier 2), NewsAPI (tier 3).
2. **Swarm line** — `[HermesSwarm] 5 votes | majority: X | N dissenters | penalty: P% | confidence: C%`. Confidence below ~50% with real signals present means the swarm genuinely disagrees — that IS the signal.
3. **Fallback warnings** — `No NEWSAPI_KEY`, `No ETHERSCAN_API_KEY` are expected without keys; the pipeline continuing is correct behavior, not an error.
4. **Telegram `[offline]`** — no bot token configured; the message printed is exactly what would have been sent.

## Report format

After running, summarize for the user:
- Which domains produced live signals vs fallbacks (and why)
- The swarm's consensus, dissent level, and confidence
- The recommended position(s) and whether action is required
- Cycle time

If a domain unexpectedly returned zero signals despite having a key, hand off to the **pipeline-doctor** subagent.
