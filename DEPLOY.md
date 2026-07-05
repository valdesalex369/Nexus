# NEXUS + HERMES — Deployment Runbook

Turn on the second brain in 5 minutes. Works on any box with Node 18+ (laptop, VPS, Railway, Render, a Raspberry Pi).

## 1. Clone + install

```bash
git clone https://github.com/valdesalex369/Nexus.git
cd Nexus
npm install
```

## 2. Configure secrets

```bash
cp .env.example .env
```

Edit `.env` and fill in what you have. Everything is optional — agents degrade gracefully — but each key unlocks a domain:

| Key | Unlocks | Where to get it |
|-----|---------|-----------------|
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Briefings, alerts, /approve /deny conductor | @BotFather on Telegram |
| `NEWSAPI_KEY` | Geopolitical + Industry + VC funding scans | newsapi.org (free: 100 req/day) |
| `ETHERSCAN_API_KEY` | Whale wallet tracking (SmartMoney + OnChain) | etherscan.io/apis (free) |
| `GITHUB_TOKEN` | DevIntel higher rate limits (works without) | github.com/settings/tokens (read-only, no scopes needed) |
| `TWITTER_BEARER_TOKEN` | Competitor analysis + engagement | developer.x.com |
| `KALSHI_API_KEY/SECRET` | Prediction market edges — **keep `KALSHI_ENV=demo`** | kalshi.com |

CoinGecko + Fear&Greed are keyless — market alpha works out of the box.

**Never commit `.env`.** It's gitignored. Private keys and seed phrases never go anywhere in this system.

## 3. Verify

```bash
npx tsc --noEmit                            # must be zero errors
npx ts-node hermes/agents/HermesAgent.ts    # one HERMES intelligence cycle
npx ts-node agents/HubAgent.ts              # one NEXUS trading cycle
```

A cycle with no keys still completes — you'll see fallback warnings and a MONITOR briefing. Add keys and signals light up domain by domain.

## 4. Turn it on (24/7)

```bash
npx ts-node scripts/runner.ts
```

Schedules:
- **Every 15 min** — NEXUS trading cycle (market → onchain → sentiment → swarm → prediction → Kelly → content → Telegram)
- **Every 30 min** — Twitter engagement check
- **Every 4 h** — HERMES intelligence cycle (geopolitical → alpha → industry → devintel → smart money → strategic swarm → briefing)
- **2 am daily** — weight recalibration from outcomes

Keep it alive in production with pm2:

```bash
npm install -g pm2
pm2 start "npx ts-node scripts/runner.ts" --name nexus
pm2 save && pm2 startup   # survive reboots
pm2 logs nexus            # watch it think
```

## 5. API server (optional — dashboard + N8N)

```bash
npx ts-node server/index.ts    # localhost:3001
```

- `POST /api/cycle` — trigger NEXUS cycle
- `POST /api/hermes/cycle` — trigger HERMES cycle
- `GET /api/status` — health + win rate
- `GET /api/memory` — full memory state

## 6. N8N automation (optional)

Import `hermes/workflows/n8n-hermes.json` into N8N. Set `NEWSAPI_KEY`, `ETHERSCAN_API_KEY`, `TELEGRAM_CHAT_ID` in N8N's environment and point the "HERMES Strategic Analysis" node at wherever the API server runs. It fires the full pipeline every 4 hours with a critical-alert fast path.

## Hosting notes

- **Cheapest real deploy**: a $5/mo VPS (Hetzner/DigitalOcean) with pm2. HERMES + NEXUS together use trivial CPU/RAM — it's all API calls and arithmetic.
- **Railway/Render**: works, use a worker process running `scripts/runner.ts`.
- **Vercel**: NOT suitable for the runner (serverless kills long-lived cron processes). Fine for the dashboard only.
- Claude Code cloud sandboxes block outbound market APIs — verify cycles run there, but live data requires your own host.

## Safety rails (always on)

- Kalshi stays in `demo` until 50+ paper trades — and live trades still require Telegram `/approve`
- Nothing posts to @Xelarocket without `/approve`
- Every outbound string passes `sanitizeOutput()` — keys can't leak into Telegram, logs, or memory
- Agents can't read `process.env` directly — the env monitor flags violations to Telegram
