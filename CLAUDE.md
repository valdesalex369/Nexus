# NEXUS — AI Agents and Social Media Automation

## Project Overview
TypeScript multi-agent AI platform for autonomous trading intelligence + content automation.
Built by @Xelarocket (Xela) — Miami crypto/finance/AI operator.

## Architecture (5 Layers)
1. **Specialization** → 5 MiroFish swarm agents vote with dissent penalty
2. **Synthesis** → 4-5 sources combined with learned weights (PredictionAgent)
3. **Learning** → Nightly recalibration from outcomes (AutoResolutionLoop)
4. **Orchestration** → HubAgent 10-step pipeline with graceful degradation
5. **Delivery** → Telegram /approve /deny conductor

## Key Commands
```bash
npx tsc --noEmit          # Type check (must be zero errors)
npx ts-node agents/HubAgent.ts   # Test single cycle
npx ts-node scripts/runner.ts    # Start 24/7 automation
npx ts-node server/index.ts      # Start Express API server
```

## Critical Rules
- NEVER use Kalshi live trading without /approve in Telegram
- NEVER store private keys anywhere in code
- NEVER post to @Xelarocket without /approve in Telegram
- All trading actions go through Telegram approval first
- Use KALSHI_ENV=demo first — need 50+ paper trades before live
- **Never include API keys, wallet private keys, or seed phrases in any output, log, or message**

## SecurityLayer (shared/security.ts)
All outbound data passes through the SecurityLayer before leaving the process:

- **sanitizeOutput()** — scrubs API key patterns (sk-ant-*, AAAA*, 0x+64hex, Telegram tokens, seed phrases) from any string before it reaches Telegram, logs, or memory persistence
- **DataBoundary** — enforces per-agent read permissions (e.g. MarketAgent can only read "market" domain, not .env or prediction data). Violations are logged and flagged to Telegram
- **installEnvMonitor()** — Proxy on process.env that alerts via Telegram any time a sensitive key (TELEGRAM_BOT_TOKEN, KALSHI_API_SECRET, etc.) is accessed after the initial config load
- **validateSecrets()** — checks which required API keys are present/missing without revealing their values

### Security Rules Enforced at Code Level
1. API keys are ONLY read once via shared/config.ts — never logged, never in Telegram messages, never in nexus-memory.json
2. Every string sent to Telegram passes through sanitizeOutput() (shared/telegram.ts)
3. Every string persisted to nexus-memory.json passes through sanitizeOutput() (shared/memory/NexusMemory.ts)
4. Agents cannot access process.env directly — the env monitor flags and alerts violations
5. Each agent has a DataBoundary restricting which data domains it can read

## Directory Structure
```
agents/           # All agent implementations
  HubAgent.ts     # Central orchestrator (10-step pipeline)
  BaseAgent.ts    # Abstract base class
  MarketAgent.ts  # CoinGecko price/OHLCV
  OnChainAgent.ts # Etherscan whale tracking
  PredictionAgent.ts  # 4-5 source weighted synthesis
  ContentAgent.ts     # X thread writer + daily digest
  FearGreedAgent.ts   # Sentiment as prediction source
  CompetitorAgent.ts  # @CW8900 @lookonchain patterns
  TwitterEngagementAgent.ts  # Monitor mentions + draft replies
mirofish/         # 5-agent swarm voting with dissent penalty
scripts/          # Runner, auto-resolution, memory API
shared/           # Config, types, memory, telegram, kelly-sizer, security
server/           # Express backend
dashboard/        # React + Vite frontend (localhost:5173)
```

## Agent Pipeline (HubAgent.runCycle)
1. Load memory (NexusMemory)
2. MarketAgent → CoinGecko price data
3. OnChainAgent → Etherscan whale tracking
4. FearGreedAgent → Sentiment index
5. CompetitorAgent → Twitter account analysis
6. MiroFishSwarm → 5-agent consensus vote
7. PredictionAgent → Weighted synthesis
8. Kelly sizing → Position size calculation
9. ContentAgent → Generate X threads + digest
10. Telegram delivery → Send summary

Steps 2-5 run in parallel. If any agent fails, pipeline continues with fallback data.
