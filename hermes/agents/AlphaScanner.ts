/**
 * AlphaScanner — Hedge fund-grade signal detection for market inefficiencies.
 *
 * Detects: statistical arbitrage, sentiment-price divergences, correlation breaks,
 * momentum regime changes, volatility transitions, and mispricings.
 *
 * Uses CoinGecko (crypto) and Fear & Greed data cross-referenced against
 * price action to find edges before they decay.
 */

import axios from "axios";
import { config } from "../../shared/config";
import { fetchToneTimeline } from "../sources/gdelt";
import type {
  AlphaSignal,
  AlphaType,
  HermesContext,
} from "../shared/hermes-types";

interface PricePoint {
  symbol: string;
  price: number;
  change24h: number;
  change7d: number;
  volume24h: number;
  marketCap: number;
  high24h: number;
  low24h: number;
}

const TRACKED_ASSETS = ["bitcoin", "ethereum", "solana", "avalanche-2", "chainlink"];

export class AlphaScanner {
  readonly name = "AlphaScanner";

  async gather(ctx: HermesContext): Promise<AlphaSignal[]> {
    console.log(`[${this.name}] Scanning for alpha signals...`);

    const prices = await this.fetchPrices();
    const fearGreed = await this.fetchFearGreed();

    const signals: AlphaSignal[] = [];

    // Run all detection algorithms
    signals.push(...this.detectSentimentDivergence(prices, fearGreed));
    signals.push(...this.detectMomentumShift(prices));
    signals.push(...this.detectVolatilityRegime(prices));
    signals.push(...this.detectCorrelationBreak(prices));
    signals.push(...this.detectMispricing(prices));
    signals.push(...(await this.detectNewsToneDivergence(prices)));

    console.log(`[${this.name}] Found ${signals.length} alpha signals`);
    return signals;
  }

  // --- Sentiment vs Price Divergence ---
  // When fear is extreme but price holds or rises = bullish divergence
  // When greed is extreme but price stalls or drops = bearish divergence
  private detectSentimentDivergence(prices: PricePoint[], fearGreed: number): AlphaSignal[] {
    const signals: AlphaSignal[] = [];
    const btc = prices.find((p) => p.symbol === "BTC");
    if (!btc) return signals;

    // Extreme fear + price rising = opportunity
    if (fearGreed < 20 && btc.change24h > 2) {
      signals.push(this.makeSignal({
        title: "Sentiment-Price Divergence: Fear + Rising Price",
        summary: `Fear & Greed at ${fearGreed} (extreme fear) but BTC up ${btc.change24h.toFixed(1)}% in 24h. Smart money may be accumulating while retail panics.`,
        alphaType: "sentiment-diverge",
        asset: "BTC",
        edgePercent: Math.abs(fearGreed - 50) / 10,
        timeHorizon: "days",
        decayRate: 0.1,
        confidence: 0.7,
        direction: "opportunity",
      }));
    }

    // Extreme greed + price dropping = threat
    if (fearGreed > 80 && btc.change24h < -2) {
      signals.push(this.makeSignal({
        title: "Sentiment-Price Divergence: Greed + Falling Price",
        summary: `Fear & Greed at ${fearGreed} (extreme greed) but BTC down ${btc.change24h.toFixed(1)}% in 24h. Distribution phase may be starting.`,
        alphaType: "sentiment-diverge",
        asset: "BTC",
        edgePercent: Math.abs(fearGreed - 50) / 10,
        timeHorizon: "days",
        decayRate: 0.15,
        confidence: 0.65,
        direction: "threat",
      }));
    }

    return signals;
  }

  // --- Momentum Regime Shift ---
  // 7d trend reversal with volume confirmation
  private detectMomentumShift(prices: PricePoint[]): AlphaSignal[] {
    const signals: AlphaSignal[] = [];

    for (const p of prices) {
      // 24h and 7d moving in opposite directions with high volume = regime change
      if (Math.sign(p.change24h) !== Math.sign(p.change7d) && Math.abs(p.change24h) > 5) {
        const direction = p.change24h > 0 ? "opportunity" : "threat";
        signals.push(this.makeSignal({
          title: `Momentum Shift: ${p.symbol}`,
          summary: `${p.symbol} 24h: ${p.change24h > 0 ? "+" : ""}${p.change24h.toFixed(1)}% vs 7d: ${p.change7d > 0 ? "+" : ""}${p.change7d.toFixed(1)}%. Trend reversal signal with volume at $${(p.volume24h / 1e9).toFixed(1)}B.`,
          alphaType: "momentum-shift",
          asset: p.symbol,
          edgePercent: Math.abs(p.change24h - p.change7d) / 5,
          timeHorizon: "hours",
          decayRate: 0.25,
          confidence: 0.6,
          direction,
        }));
      }
    }

    return signals;
  }

  // --- Volatility Regime Detection ---
  // When 24h range is > 10% of price = high vol regime
  private detectVolatilityRegime(prices: PricePoint[]): AlphaSignal[] {
    const signals: AlphaSignal[] = [];

    for (const p of prices) {
      if (p.high24h <= 0 || p.low24h <= 0) continue;
      const range = (p.high24h - p.low24h) / p.low24h;
      if (range > 0.10) {
        signals.push(this.makeSignal({
          title: `High Volatility Regime: ${p.symbol}`,
          summary: `${p.symbol} 24h range: ${(range * 100).toFixed(1)}% ($${p.low24h.toLocaleString()} - $${p.high24h.toLocaleString()}). Elevated vol creates both risk and opportunity.`,
          alphaType: "volatility-regime",
          asset: p.symbol,
          edgePercent: range * 20,
          timeHorizon: "hours",
          decayRate: 0.3,
          confidence: 0.75,
          direction: "shift",
        }));
      }
    }

    return signals;
  }

  // --- Correlation Break ---
  // ETH and SOL normally correlate with BTC; divergence = signal
  private detectCorrelationBreak(prices: PricePoint[]): AlphaSignal[] {
    const signals: AlphaSignal[] = [];
    const btc = prices.find((p) => p.symbol === "BTC");
    if (!btc) return signals;

    for (const p of prices) {
      if (p.symbol === "BTC") continue;

      // If BTC is up but alt is significantly down (or vice versa)
      const divergence = Math.abs(p.change24h - btc.change24h);
      if (divergence > 8) {
        signals.push(this.makeSignal({
          title: `Correlation Break: ${p.symbol} vs BTC`,
          summary: `${p.symbol} ${p.change24h > 0 ? "+" : ""}${p.change24h.toFixed(1)}% while BTC ${btc.change24h > 0 ? "+" : ""}${btc.change24h.toFixed(1)}%. ${divergence.toFixed(1)}% divergence from normal correlation.`,
          alphaType: "correlation-break",
          asset: p.symbol,
          edgePercent: divergence / 3,
          timeHorizon: "days",
          decayRate: 0.15,
          confidence: 0.55,
          direction: p.change24h > btc.change24h ? "opportunity" : "threat",
        }));
      }
    }

    return signals;
  }

  // --- Mispricing Detection ---
  // Volume/market-cap ratio anomalies suggest unusual activity
  private detectMispricing(prices: PricePoint[]): AlphaSignal[] {
    const signals: AlphaSignal[] = [];

    for (const p of prices) {
      if (p.marketCap <= 0) continue;
      const volumeRatio = p.volume24h / p.marketCap;

      // Normal crypto vol/mcap ratio is ~0.03-0.10. Above 0.20 = abnormal
      if (volumeRatio > 0.20) {
        signals.push(this.makeSignal({
          title: `Abnormal Volume: ${p.symbol}`,
          summary: `${p.symbol} volume/mcap ratio: ${(volumeRatio * 100).toFixed(1)}% (normal: 3-10%). Extreme trading activity relative to market cap suggests informed flow.`,
          alphaType: "mispricing",
          asset: p.symbol,
          edgePercent: (volumeRatio - 0.10) * 50,
          timeHorizon: "hours",
          decayRate: 0.4,
          confidence: 0.5,
          direction: p.change24h > 0 ? "opportunity" : "threat",
        }));
      }
    }

    return signals;
  }

  // --- News-Tone vs Price Divergence (GDELT) ---
  // Global news tone across 65 languages vs BTC price action. Tone leads
  // retail sentiment surveys; a wide gap between narrative and price is
  // the same accumulation/distribution tell as Fear&Greed divergence but
  // sourced from what the world's press is actually writing.
  private async detectNewsToneDivergence(prices: PricePoint[]): Promise<AlphaSignal[]> {
    const btc = prices.find((p) => p.symbol === "BTC");
    if (!btc) return [];

    const timeline = await fetchToneTimeline(
      '(bitcoin OR cryptocurrency OR crypto) sourcelang:english',
      "3d"
    );
    if (timeline.length < 8) return []; // too thin to trend

    // recent = last quarter of the window, prior = the rest
    const cut = Math.floor(timeline.length * 0.75);
    const avg = (pts: typeof timeline) =>
      pts.reduce((s, p) => s + p.tone, 0) / Math.max(pts.length, 1);
    const priorTone = avg(timeline.slice(0, cut));
    const recentTone = avg(timeline.slice(cut));
    const toneShift = recentTone - priorTone;

    const signals: AlphaSignal[] = [];

    // Press turning negative while price holds/rises = wall-of-worry accumulation
    if (toneShift < -1.5 && btc.change24h > 1) {
      signals.push(this.makeSignal({
        title: "News-Tone Divergence: Darkening Press + Rising Price",
        summary: `Global crypto news tone fell ${Math.abs(toneShift).toFixed(1)} pts (GDELT, 65 languages) while BTC gained ${btc.change24h.toFixed(1)}% in 24h. Price absorbing bad news is an accumulation tell.`,
        alphaType: "sentiment-diverge",
        asset: "BTC",
        edgePercent: Math.min(Math.abs(toneShift), 6),
        timeHorizon: "days",
        decayRate: 0.1,
        confidence: 0.6,
        direction: "opportunity",
      }));
    }

    // Press euphoric while price stalls/drops = distribution into good news
    if (toneShift > 1.5 && btc.change24h < -1) {
      signals.push(this.makeSignal({
        title: "News-Tone Divergence: Euphoric Press + Falling Price",
        summary: `Global crypto news tone rose ${toneShift.toFixed(1)} pts (GDELT) while BTC dropped ${Math.abs(btc.change24h).toFixed(1)}% in 24h. Price rejecting good news suggests distribution.`,
        alphaType: "sentiment-diverge",
        asset: "BTC",
        edgePercent: Math.min(toneShift, 6),
        timeHorizon: "days",
        decayRate: 0.15,
        confidence: 0.6,
        direction: "threat",
      }));
    }

    return signals;
  }

  // --- Data Fetchers ---

  private async fetchPrices(): Promise<PricePoint[]> {
    try {
      const { data } = await axios.get(`${config.coingecko.baseUrl}/coins/markets`, {
        params: {
          vs_currency: "usd",
          ids: TRACKED_ASSETS.join(","),
          order: "market_cap_desc",
          price_change_percentage: "24h,7d",
        },
        timeout: 15_000,
      });

      return (data as any[]).map((c) => ({
        symbol: c.symbol.toUpperCase(),
        price: c.current_price ?? 0,
        change24h: c.price_change_percentage_24h ?? 0,
        change7d: c.price_change_percentage_7d_in_currency ?? 0,
        volume24h: c.total_volume ?? 0,
        marketCap: c.market_cap ?? 0,
        high24h: c.high_24h ?? 0,
        low24h: c.low_24h ?? 0,
      }));
    } catch (err) {
      console.error(`[${this.name}] Price fetch failed:`, err);
      return [];
    }
  }

  private async fetchFearGreed(): Promise<number> {
    try {
      const { data } = await axios.get(config.fearGreed.baseUrl, {
        params: { limit: 1 },
        timeout: 10_000,
      });
      return parseInt(data.data?.[0]?.value ?? "50", 10);
    } catch {
      return 50;
    }
  }

  // --- Helpers ---

  private makeSignal(opts: {
    title: string;
    summary: string;
    alphaType: AlphaType;
    asset: string;
    edgePercent: number;
    timeHorizon: AlphaSignal["timeHorizon"];
    decayRate: number;
    confidence: number;
    direction: AlphaSignal["direction"];
  }): AlphaSignal {
    return {
      id: `alpha-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      domain: "market-alpha",
      title: opts.title,
      summary: opts.summary,
      direction: opts.direction,
      threatLevel: opts.edgePercent > 5 ? "high" : opts.edgePercent > 2 ? "medium" : "low",
      confidence: opts.confidence,
      source: "AlphaScanner",
      affectedSectors: ["crypto", "finance"],
      timestamp: Date.now(),
      tags: [opts.alphaType, opts.asset.toLowerCase()],
      alphaType: opts.alphaType,
      asset: opts.asset,
      edgePercent: opts.edgePercent,
      timeHorizon: opts.timeHorizon,
      decayRate: opts.decayRate,
    };
  }

  fallback(): AlphaSignal[] {
    return [];
  }
}
