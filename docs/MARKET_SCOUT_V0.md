# Market Scout v0

## Mission
Build one read-only, event-driven market sensor that removes screenshot/manual-checking work from Alex without gaining trading or signing authority.

## Watched identities
- Solana / Phantom: `FvUwXJ9T34oock3kv6CThyq1wNjA4Kf4uxPB534YyQBw`
- EVM wallet: `0x1651aEB1118b0E777Fc88b8f5887B240e41cd579`

These are public addresses only. Never request, store, transmit, or derive seed phrases/private keys.

## Inputs
1. Direct blockchain indexer/RPC for wallet balances, token holdings, transfers, swaps, and transaction timestamps. Preferred integration: Alchemy or another direct Solana+EVM indexer. Search-engine indexing is not acceptable evidence for wallet state.
2. CoinMarketCap for live BTC/ETH/SOL and selected token quotes, market-wide derivatives/open-interest/funding/liquidations, trending narratives, and macro-calendar context.
3. Fresh public primary/reputable sources for material geopolitical, oil, shipping, rates, and policy events.

## Event schema
Emit a normalized JSON event only when something materially changes:

```json
{
  "observed_at": "ISO-8601",
  "source": "alchemy|cmc|public_source",
  "kind": "wallet_transfer|wallet_position_change|leverage_shift|price_break|liquidity_shift|geopolitical_delta",
  "asset_or_entity": "string",
  "value": {},
  "evidence": [],
  "confidence": 0.0,
  "materiality": 0.0,
  "falsifier": "string",
  "recommended_next_check": "string"
}
```

## Alert gates
Do not alert on ordinary price noise. Alert only when one of these is true:
- either watched wallet has a material balance/position/transfer change;
- BTC/ETH/SOL breaks a predeclared decision level with corroborating volume/leverage evidence;
- perpetual OI/funding/liquidations produce a materially crowded regime;
- a tracked meme token has simultaneous liquidity + volume + holder/flow confirmation rather than price-only momentum;
- a verified geopolitical/policy event changes the probability of the active market regime;
- oil/physical-flow evidence materially contradicts the dominant narrative.

## Safety boundary
Read-only only. No order placement, trade execution, transaction signing, wallet connection, approvals, withdrawals, deposits, publication, or credential changes. API keys, if required by an external runtime, belong only in that runtime's secret store and never in prompts, GitHub, or the bus.

## Acceptance tests
1. Given the Solana address, direct indexer lookup returns a timestamped balance/holdings snapshot or an explicit provider error; never substitute web-search absence as `no activity`.
2. Given the EVM address, direct indexer lookup returns a timestamped balance/holdings snapshot across the configured EVM networks or an explicit provider error.
3. A no-change polling/webhook cycle emits no user alert.
4. A simulated transfer above the configured materiality threshold produces one normalized event with evidence and falsifier.
5. A price-only meme move with no liquidity/volume confirmation is suppressed.
6. A corroborated market event produces exactly one bounded recommended next check, never an autonomous trade.
7. Secrets scan passes and repository contains no credentials.

## First implementation slice
Implement only the wallet-observation adapter plus event normalization for the two public addresses. Do not add execution, UI, dashboards, or autonomous trading. After direct wallet reads are TEST_CONFIRMED, add market/leverage inputs as a second mission.
