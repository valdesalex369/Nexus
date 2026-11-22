# NEXUS — The Organization

Everything in this repo organized like a company. Runtime agents do the work
24/7; Claude subagents build and maintain the machine; skills are the standard
operating procedures that tie them together.

```
                            ┌─────────────────────┐
                            │      Xela (CEO)     │
                            │  Telegram /approve  │
                            └──────────┬──────────┘
                 ┌─────────────────────┼─────────────────────┐
                 ▼                     ▼                     ▼
        ┌────────────────┐   ┌────────────────┐   ┌────────────────┐
        │  NEXUS (rev.)  │   │ HERMES (intel) │   │  DEV TEAM (AI) │
        │ trading+content│   │  second brain  │   │Claude subagents│
        └────────────────┘   └────────────────┘   └────────────────┘
```

## Trading Desk — NEXUS runtime (24/7)

| Role | Agent | Job |
|------|-------|-----|
| Desk head | `agents/HubAgent.ts` | 10-step pipeline, graceful degradation |
| Market data | `agents/MarketAgent.ts` | CoinGecko price/OHLCV |
| On-chain | `agents/OnChainAgent.ts` | Etherscan whale tracking |
| Sentiment | `agents/FearGreedAgent.ts` | Fear & Greed index |
| Competition | `agents/CompetitorAgent.ts` | @CW8900, @lookonchain patterns |
| Voting floor | `mirofish/index.ts` | 5-agent consensus, dissent penalty |
| Synthesis | `agents/PredictionAgent.ts` | 4-5 source weighted prediction |
| Risk | `shared/kelly-sizer.ts` | Half-Kelly position sizing |
| Media | `agents/ContentAgent.ts` | X threads + daily digest |
| Community | `agents/TwitterEngagementAgent.ts` | Mentions + draft replies |

## Intelligence Division — HERMES runtime (every 4h)

| Role | Agent | Job |
|------|-------|-----|
| Station chief | `hermes/agents/HermesAgent.ts` | 8-step intelligence pipeline |
| Geopolitics | `hermes/agents/GeopoliticalAgent.ts` | WorldMonitor → GDELT → NewsAPI chain |
| Quant | `hermes/agents/AlphaScanner.ts` | 6 detectors incl. GDELT news-tone divergence |
| Sectors | `hermes/agents/IndustryRadar.ts` | 6 industries, shift detection |
| Dev ecosystem | `hermes/agents/DevIntelAgent.ts` | GitHub trends, paradigm shifts |
| Smart money | `hermes/agents/SmartMoneyAgent.ts` | Whale wallets, VC funding |
| Moderator | `hermes/agents/RoundtableAgent.ts` | Cross-domain crossfire → angles (convergence/contradiction/lone-wolf) |
| War room | `hermes/mirofish/hermes-swarm.ts` | Two-round debate: vote → hear peers → revise (caution-only) |
| Strategist | `hermes/agents/StrategistAgent.ts` | Positions: build/learn/allocate/hedge/avoid/exit |

**The Agora** (`shared/agora.ts`): the room where they talk — a per-cycle
message bus carrying observations, challenges, revisions, and insights.
The transcript ships with every briefing; top angles persist into
NexusMemory so the trading desk inherits what the intelligence division
figured out. Watch a live debate: `npx ts-node scripts/agora-demo.ts`.

**Data supply chain** (`hermes/sources/`): `worldmonitor.ts` (structured world
events, free, no key) and `gdelt.ts` (translingual news + tone, free, no key,
throttled to respect the 1-per-5s limit). Both cache per cycle and degrade to [].

## Dev Team — Claude subagents (`.claude/agents/`)

| Department | Subagent | Model | Mandate |
|-----------|----------|-------|---------|
| Engineering | `nexus-builder` | Opus | Build features end-to-end, every convention |
| Quant R&D | `signal-architect` | Opus | Design signals, scoring, swarm mechanics |
| Research | `alpha-researcher` | Opus | Sourced intelligence briefs, API evaluation |
| Security | `security-guardian` | Sonnet | Secret leaks, sanitizeOutput, DataBoundary |
| SRE | `pipeline-doctor` | Sonnet | Diagnose cycle failures, trace signal flow |

## Standard Operating Procedures — skills (`.claude/skills/`)

| Skill | Department | When |
|-------|-----------|------|
| `run-cycle` | Operations | Run + interpret a NEXUS/HERMES cycle |
| `ship` | Operations | Pre-flight gates: typecheck → secret scan → commit → push |
| `new-agent` | Engineering | Six-step checklist for adding any agent |
| `security-audit` | Security | Full SecurityLayer audit before merge |
| `intel-brief` | Research | Sourced brief on any topic or API |

## How work flows

1. **Research** something new → `intel-brief` → alpha-researcher returns a verdict
2. **Design** the signal → signal-architect specs scoring + integration
3. **Build** it → `new-agent` checklist → nexus-builder implements
4. **Audit** it → `security-audit` → security-guardian signs off
5. **Ship** it → `ship` gates → commit + push
6. **Runtime** picks it up next cycle; if it misbehaves → pipeline-doctor

Approval authority never delegates: trades, posts, and anything leaving the
building go through Telegram `/approve` — the CEO's desk.
