/**
 * MarketAgent — Fetches price data, OHLCV candles, and macro context from CoinGecko.
 */

import axios from "axios";
import { BaseAgent } from "./BaseAgent";
import { config } from "../shared/config";
import type { AgentContext, MarketSnapshot, OHLCVCandle } from "../shared/types";

const TRACKED_COINS = ["bitcoin", "ethereum", "solana"];
const BASE = config.coingecko.baseUrl;

export class MarketAgent extends BaseAgent {
  constructor() {
    super("MarketAgent", "market");
  }

  protected async execute(ctx: AgentContext): Promise<{
    snapshots: MarketSnapshot[];
    candles: Record<string, OHLCVCandle[]>;
  }> {
    const [snapshots, candles] = await Promise.all([
      this.fetchSnapshots(),
      this.fetchCandles(),
    ]);
    return { snapshots, candles };
  }

  private async fetchSnapshots(): Promise<MarketSnapshot[]> {
    try {
      const { data } = await axios.get(`${BASE}/coins/markets`, {
        params: {
          vs_currency: "usd",
          ids: TRACKED_COINS.join(","),
          order: "market_cap_desc",
        },
        timeout: 10_000,
      });
      return (data as any[]).map((c) => ({
        symbol: c.symbol.toUpperCase(),
        price: c.current_price,
        change24h: c.price_change_percentage_24h ?? 0,
        volume24h: c.total_volume,
        marketCap: c.market_cap,
        timestamp: Date.now(),
      }));
    } catch (err) {
      console.error("[MarketAgent] fetchSnapshots failed:", err);
      return [];
    }
  }

  private async fetchCandles(): Promise<Record<string, OHLCVCandle[]>> {
    const result: Record<string, OHLCVCandle[]> = {};
    for (const coin of TRACKED_COINS) {
      try {
        const { data } = await axios.get(`${BASE}/coins/${coin}/ohlc`, {
          params: { vs_currency: "usd", days: 7 },
          timeout: 10_000,
        });
        result[coin] = (data as number[][]).map(([ts, o, h, l, c]) => ({
          open: o,
          high: h,
          low: l,
          close: c,
          volume: 0, // OHLC endpoint doesn't include volume
          timestamp: ts,
        }));
      } catch {
        result[coin] = [];
      }
    }
    return result;
  }

  override fallback() {
    return { snapshots: [], candles: {} };
  }
}
