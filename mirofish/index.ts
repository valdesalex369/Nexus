/**
 * MiroFish — 5-agent swarm voting system with dissent penalty.
 *
 * Each swarm agent independently evaluates market conditions and votes
 * on a directional prediction. Dissenting agents reduce overall confidence
 * via a penalty factor, forcing high-conviction consensus for strong signals.
 */

import type {
  AgentContext,
  PredictionDirection,
  SwarmConsensus,
  SwarmVote,
  MarketSnapshot,
} from "../shared/types";

interface SwarmAgentDef {
  id: string;
  strategy: string;
  evaluate: (ctx: AgentContext) => SwarmVote;
}

/**
 * Dissent penalty: each dissenting agent reduces confidence by this factor.
 * With 5 agents, 2 dissenters => penalty = 0.3 (30% reduction).
 */
const DISSENT_PENALTY_PER_AGENT = 0.15;

function getMarketSnapshot(ctx: AgentContext): MarketSnapshot | undefined {
  const snapshots = (ctx.marketData as any)?.snapshots as MarketSnapshot[] | undefined;
  return snapshots?.find((s) => s.symbol === "BTC");
}

/** Momentum — follows recent price direction */
const momentumAgent: SwarmAgentDef = {
  id: "mirofish-momentum",
  strategy: "momentum",
  evaluate(ctx) {
    const btc = getMarketSnapshot(ctx);
    const change = btc?.change24h ?? 0;
    const direction: PredictionDirection =
      change > 2 ? "bullish" : change < -2 ? "bearish" : "neutral";
    return {
      agentId: this.id,
      direction,
      confidence: Math.min(Math.abs(change) / 10, 0.9),
      reasoning: `24h momentum: ${change.toFixed(2)}%`,
      dissent: false,
    };
  },
};

/** Contrarian — fades extreme moves */
const contrarianAgent: SwarmAgentDef = {
  id: "mirofish-contrarian",
  strategy: "contrarian",
  evaluate(ctx) {
    const btc = getMarketSnapshot(ctx);
    const change = btc?.change24h ?? 0;
    // Contrarian: strong up = bearish, strong down = bullish
    let direction: PredictionDirection = "neutral";
    if (change > 5) direction = "bearish";
    else if (change < -5) direction = "bullish";
    return {
      agentId: this.id,
      direction,
      confidence: Math.abs(change) > 5 ? 0.7 : 0.3,
      reasoning: `Contrarian fade: ${change.toFixed(2)}% move`,
      dissent: false,
    };
  },
};

/** Volume — analyzes volume anomalies */
const volumeAgent: SwarmAgentDef = {
  id: "mirofish-volume",
  strategy: "volume",
  evaluate(ctx) {
    const btc = getMarketSnapshot(ctx);
    const volume = btc?.volume24h ?? 0;
    // Simplified: high volume during uptrend = bullish confirmation
    const change = btc?.change24h ?? 0;
    const highVolume = volume > 30_000_000_000; // > $30B
    let direction: PredictionDirection = "neutral";
    if (highVolume && change > 0) direction = "bullish";
    else if (highVolume && change < 0) direction = "bearish";
    return {
      agentId: this.id,
      direction,
      confidence: highVolume ? 0.65 : 0.3,
      reasoning: `Volume: $${(volume / 1e9).toFixed(1)}B, change: ${change.toFixed(2)}%`,
      dissent: false,
    };
  },
};

/** Sentiment — reads Fear & Greed as contrarian */
const sentimentAgent: SwarmAgentDef = {
  id: "mirofish-sentiment",
  strategy: "sentiment",
  evaluate(ctx) {
    const fg = ctx.fearGreedData as { value?: number } | undefined;
    const value = fg?.value ?? 50;
    // Extreme fear = bullish, extreme greed = bearish (contrarian)
    let direction: PredictionDirection = "neutral";
    if (value < 25) direction = "bullish";
    else if (value > 75) direction = "bearish";
    return {
      agentId: this.id,
      direction,
      confidence: Math.abs(value - 50) / 50,
      reasoning: `Fear & Greed: ${value} — contrarian signal`,
      dissent: false,
    };
  },
};

/** On-chain — reads whale behavior */
const onChainSwarmAgent: SwarmAgentDef = {
  id: "mirofish-onchain",
  strategy: "onchain",
  evaluate(ctx) {
    const whales = (ctx.onChainData as any)?.whaleTransactions ?? [];
    const count = Array.isArray(whales) ? whales.length : 0;
    // Many whale txns often precede volatility; direction is ambiguous
    let direction: PredictionDirection = "neutral";
    if (count > 10) direction = "bearish"; // heavy distribution
    else if (count > 3) direction = "bullish"; // accumulation
    return {
      agentId: this.id,
      direction,
      confidence: Math.min(count / 15, 0.8),
      reasoning: `${count} whale transactions detected`,
      dissent: false,
    };
  },
};

const SWARM_AGENTS: SwarmAgentDef[] = [
  momentumAgent,
  contrarianAgent,
  volumeAgent,
  sentimentAgent,
  onChainSwarmAgent,
];

export class MiroFishSwarm {
  /**
   * Run all 5 swarm agents and compute consensus with dissent penalty.
   */
  async vote(ctx: AgentContext): Promise<SwarmConsensus> {
    const votes: SwarmVote[] = SWARM_AGENTS.map((agent) => agent.evaluate(ctx));

    // Count directions
    const tally: Record<PredictionDirection, number> = {
      bullish: 0,
      bearish: 0,
      neutral: 0,
    };
    for (const v of votes) {
      tally[v.direction]++;
    }

    // Majority direction
    const majorityDirection = (
      Object.entries(tally) as [PredictionDirection, number][]
    ).sort((a, b) => b[1] - a[1])[0][0];

    // Mark dissenters
    const dissentCount = votes.filter((v) => {
      const isDissent = v.direction !== majorityDirection && v.direction !== "neutral";
      v.dissent = isDissent;
      return isDissent;
    }).length;

    const dissentPenalty = Math.min(dissentCount * DISSENT_PENALTY_PER_AGENT, 0.6);

    // Weighted average confidence of majority voters
    const majorityVotes = votes.filter((v) => v.direction === majorityDirection);
    const rawConfidence =
      majorityVotes.length > 0
        ? majorityVotes.reduce((sum, v) => sum + v.confidence, 0) /
          majorityVotes.length
        : 0;

    const confidence = rawConfidence * (1 - dissentPenalty);

    console.log(
      `[MiroFish] ${votes.length} votes | ${majorityDirection} majority | ` +
      `${dissentCount} dissenters | penalty: ${(dissentPenalty * 100).toFixed(0)}% | ` +
      `confidence: ${(confidence * 100).toFixed(1)}%`
    );

    return {
      direction: majorityDirection,
      confidence,
      votes,
      dissentPenalty,
      timestamp: Date.now(),
    };
  }
}
