# Grand Wizard + Sparta — Eagle Eye desk (v0)

Status: **tested locally, proposed in draft PR; not deployed as an automated service.**

One-shot command from repository root:

```sh
python -m unittest discover -s tests -p 'test_agent_research_desk.py' -v
python src/nexus/agent_research_desk.py data/paper/latest.json --output data/paper/review.json
```

- Grand Wizard proposes a hypothesis from BTC, ETH, SOL paper tape and explicitly lists a falsifier. This is a **simple deterministic classifier**, not an LLM, conscious agent, probability model, or trained hedge-fund signal.
- Sparta is an adversarial quality gate. Missing timestamps, snapshots older than 35 minutes, missing BTC/ETH/SOL, invalid prices or any live-order authority trigger a **BLOCKED** verdict.
- Fresh paper snapshots are **RESEARCH_ONLY**, never live-execution approval. Provider quote timestamps aren't independently verified by the current scout.
- The source receipt is a SHA-256 digest of the exact JSON snapshot, with timestamp and a human gate. The JSON result can be filed by Muse.
- Do not schedule a second polling process. Muse owns coordination; reuse the existing scout when a human has reviewed the PR.
- A stale/blocked verdict must never be converted to BUY or SELL by downstream tools. Do not trade, sign, spend or transmit orders.
- Prefer an explicit NO_ACTION over filling a quota of signals.

## Verification evidence (2026-11-24)

Six tests passed locally using Python unittest in a standalone environment. A hand-entered fixture based on the repo's latest snapshot generated at 06:27:56 UTC was tested at 14:13 UTC, returning **exit code 2**, **STALE_SNAPSHOT**, and **BLOCKED**. The fixture contains a subset of the saved market tape, not a fresh authenticated exchange sample. GitHub PR CI must independently pass before merging.

## Grand Wizard morning decision

**Hypothesis:** defensive risk regime. Current externally verified research snapshot: BTC around $60,143 (-4.39% 24h), ETH around $1,695 (-5.22%), SOL around $70.04 (-7.03%) at ~14:08 UTC, sourced from CoinMarketCap via the connected research tool. Watch whether downside continues with spot evidence; no live trades proposed.

**Falsifier:** prices stabilize, spot demand grows and macro/news breadth confirms sustained recovery.

## Sparta morning challenge

1. Extreme-fear readings are not enough to establish a reversal.
2. Falling crypto prices and rising turnover are not proof of institutional accumulation.
3. Modeled liquidation heatmaps are **not actual order-book liquidity**.
4. Pre-open stock momentum can reverse at 9:30 or at the 10:00 confidence release.
5. The 50-day backtest is one exploratory rule, not a validated edge; ETF data stops December 2025 and trading frictions are only partially modeled.
6. Repo's existing paper snapshot is stale. Block all decisions sourced only from it.

## Historical rule scan (exploratory, 2024-01-01 to 2025-12-24)

Signal: yesterday's close compared with 50-day trailing SMA; daily close-to-close returns; long/cash or short/cash; 10 bps per position-side transition for ETFs and 20 bps for BTC. No interest on cash, dividends/borrow/funding modeled separately. Source ETF: https://github.com/m-khut/etf-analaysis (prices.csv). Source BTC: https://github.com/daniegitx1/btc-price-history (btc_usd_daily.csv).

| Asset | Buy hold % | Long/cash % | Short/cash % |
|---|---:|---:|---:|
| SPY | 45.25 | 30.30 | -13.05 |
| QQQ | 52.36 | 32.52 | -17.07 |
| GLD | 115.48 | 70.91 | -21.02 |
| USO | 5.33 | -34.72 | -43.38 |
| TLT | -10.97 | -26.67 | -19.01 |
| BTC | 107.31 | 74.56 | -31.93 |

BTC 2026-01-01 to 2026-11-23: buy-hold -30.04%, long/cash +12.14%, short/cash +42.02%. Crypto trades include 20bps position-side cost but no actual futures funding/slippage. These outcomes are historical, subject to data limitations and not predictive.

## Primary sources, catalysts

- NVIDIA reinstatement: https://nvidianews.nvidia.com/news/nvidia-board-reinstates-jensen-huang-as-president-ceo-and-board-director
- U.S. Treasury Nov 23 sanctions: https://home.treasury.gov/news/press-releases/sb0699
- Sanofi to acquire Insmed $175/share: https://www.sanofi.com/en/media-room/press-releases/2026/2026-11-24-06-30-00-3409002

## Stop conditions

If source freshness fails, price is inconsistent, venue/time unknown, a critical market is missing, expected value can't be established, or a human countersignature is absent: **stop at research**.

No additional scheduled tasks, no live wallets, and no destructive cleanup.
