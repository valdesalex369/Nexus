# NEXUS — Autonomous AI Agent Platform

## Architecture
- `/server/src/agents/` — 7 agents, all extend BaseAgent (Claude API + tool-use + memory)
- `/server/src/memory/` — Zettelkasten knowledge graph + self-evolution weights
- `/server/src/tools/` — Tool definitions agents can call (memory, Telegram, fetch, call_agent)
- `/server/src/telegram.js` — Telegram conductor (notifications + approval gate)
- `/server/src/scheduler/` — Cycle runner for automated pipelines
- `/server/src/middleware/` — Auth, rate limiting, structured logging
- `/dashboard/` — React + Vite frontend

## Agents
HubAgent (orchestrator), ContentAgent, MarketAgent, PredictionAgent, SEOAgent, MiroFishAgent (5-agent swarm), OnChainAgent (whale tracking)

## Key Rules
- Money/public posts ALWAYS require Telegram /approve — never auto-grant
- Agent memory persists to /server/data/memory/ as linked JSON notes
- Evolution weights auto-recalibrate after 10 outcomes
- Tools: store_memory, search_memory, send_telegram, request_human_approval, call_agent, fetch_url

## Commands
```bash
cd server && npm run dev       # API server
cd server && npm run cycle     # Run one NEXUS cycle
cd dashboard && npm run dev    # Frontend
```
