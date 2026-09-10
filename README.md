# NEXUS
AI Agents and Social Media Automation

A TypeScript multi-agent platform for autonomous trading intelligence, content automation, and social media engagement.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your API keys

# Type check
npx tsc --noEmit

# Run a single test cycle
npx ts-node agents/HubAgent.ts

# Start 24/7 automation
npx ts-node scripts/runner.ts

# Start API server (localhost:3001)
npx ts-node server/index.ts
```

## Architecture

**5-Layer System:**

| Layer | Purpose | Component |
|-------|---------|-----------|
| Specialization | 5 swarm agents vote with dissent penalty | MiroFish |
| Synthesis | 4-5 sources combined with learned weights | PredictionAgent |
| Learning | Nightly recalibration from outcomes | AutoResolutionLoop |
| Orchestration | 10-step pipeline, graceful degradation | HubAgent |
| Delivery | Telegram /approve /deny conductor | Telegram module |

## Agents

| Agent | Role | Status |
|-------|------|--------|
| HubAgent | Central orchestrator | Ready |
| MarketAgent | CoinGecko price/OHLCV | Ready |
| OnChainAgent | Etherscan whale tracking | Ready |
| PredictionAgent | Weighted prediction synthesis | Ready |
| ContentAgent | X thread writer + daily digest | Ready |
| FearGreedAgent | Sentiment signal (5th source) | Ready |
| CompetitorAgent | @CW8900 @lookonchain patterns | Ready |
| TwitterEngagementAgent | Monitor mentions + draft replies | Ready |

## Schedules (runner.ts)

| Frequency | Task |
|-----------|------|
| Every 15 min | HubAgent.runCycle() |
| Every 30 min | TwitterEngagementAgent |
| Daily 8am | CompetitorAgent |
| Daily 2am | AutoResolutionLoop (recalibration) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/status | System health check |
| GET | /api/memory | Full NexusMemory state |
| GET | /api/memory/weights | Prediction source weights |
| GET | /api/predictions?limit=20 | Recent predictions |
| POST | /api/cycle | Trigger manual cycle |
