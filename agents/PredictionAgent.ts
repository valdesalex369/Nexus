/**
 * PredictionAgent — 4-5 source weighted synthesis for directional prediction.
 *
 * Sources: MarketAgent, OnChainAgent, MiroFish swarm, FearGreedAgent, CompetitorAgent
 * Each source provides a direction + confidence. Weights are learned over time
 * via NexusMemory and nightly recalibration.
 */

import { BaseAgent } from "./BaseAgent";
import { kellyFromPrediction } from "../shared/kelly-sizer";
import type {
  AgentContext,
  PredictionDirection,
  PredictionOutput,
  PredictionSource,
  SwarmConsensus,
  MarketSnapshot,
  FearGreedReading,
} from "../shared/types";

export class PredictionAgent extends BaseAgent {
  constructor() {
    super("PredictionAgent", "prediction");
  }

  protected async execute(ctx: AgentContext): Promise<PredictionOutput> {
    const weights = ctx.memory.predictionWeights;
    const sources = this.gatherSources(ctx, weights);
    const { direction, confidence } = this.synthesize(sources);

    // Kelly sizing assuming even-money market (price = 0.50)
    const kelly = kellyFromPrediction(confidence, 0.5);

    return {
      symbol: "BTC",
      direction,
      confidence,
      sources,
      kellySizePercent: kelly.sizePercent,
      timestamp: Date.now(),
    };
  }

  private gatherSources(
    ctx: AgentContext,
    weights: Record<string, number>
  ): PredictionSource[] {
    const sources: PredictionSource[] = [];

    // 1. Market data signal
    const snapshots = ((ctx.marketData as any)?.snapshots ?? []) as MarketSnapshot[];
    const btc = snapshots.find((s) => s.symbol === "BTC");
    if (btc) {
      sources.push({
        name: "market",
        direction: btc.change24h > 1 ? "bullish" : btc.change24h < -1 ? "bearish" : "neutral",
        confidence: Math.min(Math.abs(btc.change24h) / 10, 1),
        weight: weights.market ?? 0.25,
        reasoning: `BTC 24h change: ${btc.change24h.toFixed(2)}%`,
      });
    }

    // 2. On-chain signal (whale activity)
    const whales = ((ctx.onChainData as any)?.whaleTransactions ?? []) as any[];
    if (whales.length > 0) {
      sources.push({
        name: "onchain",
        direction: whales.length > 5 ? "bearish" : "bullish",
        confidence: Math.min(whales.length / 10, 0.8),
        weight: weights.onchain ?? 0.20,
        reasoning: `${whales.length} whale transactions detected`,
      });
    }

    // 3. MiroFish swarm consensus
    const swarm = ctx.swarmConsensus as SwarmConsensus | undefined;
    if (swarm) {
      sources.push({
        name: "mirofish",
        direction: swarm.direction,
        confidence: swarm.confidence * (1 - swarm.dissentPenalty),
        weight: weights.mirofish ?? 0.25,
        reasoning: `Swarm vote: ${swarm.votes.length} agents, dissent penalty ${(swarm.dissentPenalty * 100).toFixed(0)}%`,
      });
    }

    // 4. Fear & Greed
    const fg = ctx.fearGreedData as FearGreedReading | undefined;
    if (fg) {
      const fgDirection: PredictionDirection =
        fg.value < 25 ? "bullish" : fg.value > 75 ? "bearish" : "neutral";
      sources.push({
        name: "feargreed",
        direction: fgDirection,
        confidence: Math.abs(fg.value - 50) / 50,
        weight: weights.feargreed ?? 0.15,
        reasoning: `Fear & Greed: ${fg.value} (${fg.label}) — contrarian signal`,
      });
    }

    // 5. Competitor intel
    const competitor = ctx.competitorData as { direction?: PredictionDirection; reasoning?: string } | undefined;
    if (competitor?.direction) {
      sources.push({
        name: "competitor",
        direction: competitor.direction,
        confidence: 0.5,
        weight: weights.competitor ?? 0.15,
        reasoning: competitor.reasoning ?? "Competitor pattern analysis",
      });
    }

    return sources;
  }

  private synthesize(sources: PredictionSource[]): {
    direction: PredictionDirection;
    confidence: number;
  } {
    if (sources.length === 0) {
      return { direction: "neutral", confidence: 0 };
    }

    // Weighted directional score: bullish = +1, bearish = -1, neutral = 0
    let weightedSum = 0;
    let totalWeight = 0;
    let confidenceSum = 0;

    for (const s of sources) {
      const dirScore =
        s.direction === "bullish" ? 1 : s.direction === "bearish" ? -1 : 0;
      weightedSum += dirScore * s.confidence * s.weight;
      totalWeight += s.weight;
      confidenceSum += s.confidence * s.weight;
    }

    const normalizedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const confidence = totalWeight > 0 ? confidenceSum / totalWeight : 0;

    const direction: PredictionDirection =
      normalizedScore > 0.1
        ? "bullish"
        : normalizedScore < -0.1
          ? "bearish"
          : "neutral";

    return { direction, confidence: Math.min(confidence, 1) };
  }

  override fallback() {
    return {
      symbol: "BTC",
      direction: "neutral" as PredictionDirection,
      confidence: 0,
      sources: [],
      kellySizePercent: 0,
      timestamp: Date.now(),
    };
  }
}
