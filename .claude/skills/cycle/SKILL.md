---
name: cycle
description: "WHEN the user wants to run a single NEXUS agent cycle. Full pipeline: market scan → onchain → MiroFish consensus → prediction → content → Telegram delivery."
---

# /cycle — Run One NEXUS Cycle

Execute via `POST /api/cycle` or `npm run cycle`.

Pipeline: Market scan → On-chain scan → MiroFish 5-agent vote → Prediction synthesis → Content digest → Telegram delivery.

Combine with `/loop 1h /cycle` for 24/7 monitoring.
