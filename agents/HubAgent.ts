/**
 * HubAgent — Central orchestrator for the NEXUS 10-step pipeline.
 *
 * Runs the full cycle:
 *  1. Load memory
 *  2. Market data (MarketAgent)
 *  3. On-chain data (OnChainAgent)
 *  4. Fear & Greed (FearGreedAgent)
 *  5. Competitor intel (CompetitorAgent)
 *  6. MiroFish swarm vote
 *  7. Prediction synthesis (PredictionAgent)
 *  8. Kelly sizing (embedded in PredictionAgent)
 *  9. Content generation (ContentAgent)
 * 10. Telegram delivery
 *
 * Each step has graceful degradation — if an agent fails, the pipeline
 * continues with fallback data.
 */

import { NexusMemory } from "../shared/memory/NexusMemory";
import { sendMessage } from "../shared/telegram";
import { installEnvMonitor, sanitizeOutput, DataBoundary } from "../shared/security";
import type { AgentContext, AgentResult, PredictionOutput } from "../shared/types";

import { MarketAgent } from "./MarketAgent";
import { OnChainAgent } from "./OnChainAgent";
import { FearGreedAgent } from "./FearGreedAgent";
import { CompetitorAgent } from "./CompetitorAgent";
import { PredictionAgent } from "./PredictionAgent";
import { ContentAgent } from "./ContentAgent";
import { TwitterEngagementAgent } from "./TwitterEngagementAgent";
import { MiroFishSwarm } from "../mirofish";

export class HubAgent {
  private memory: NexusMemory;
  private cycleCount = 0;

  // Agents
  private marketAgent = new MarketAgent();
  private onChainAgent = new OnChainAgent();
  private fearGreedAgent = new FearGreedAgent();
  private competitorAgent = new CompetitorAgent();
  private predictionAgent = new PredictionAgent();
  private contentAgent = new ContentAgent();
  private engagementAgent = new TwitterEngagementAgent();
  private mirofish = new MiroFishSwarm();

  // DataBoundary instances per agent — enforce read permissions
  private boundaries = {
    market: new DataBoundary("MarketAgent", "market"),
    onchain: new DataBoundary("OnChainAgent", "onchain"),
    prediction: new DataBoundary("PredictionAgent", "prediction"),
    content: new DataBoundary("ContentAgent", "content"),
    engagement: new DataBoundary("TwitterEngagementAgent", "engagement"),
    sentiment: new DataBoundary("FearGreedAgent", "sentiment"),
    competitor: new DataBoundary("CompetitorAgent", "competitor"),
  };

  constructor() {
    this.memory = new NexusMemory();

    // SecurityLayer: install env access monitor AFTER config has loaded.
    // Any subsequent reads of sensitive env vars will trigger a warning + Telegram alert.
    installEnvMonitor((msg) => {
      sendMessage(`🔐 *Security Alert*\n${sanitizeOutput(msg)}`);
    });
  }

  /**
   * Run the full 10-step NEXUS pipeline.
   */
  async runCycle(): Promise<{
    cycle: number;
    results: Record<string, AgentResult>;
    prediction: PredictionOutput | null;
  }> {
    this.cycleCount++;
    const cycleStart = Date.now();
    console.log(`\n========== NEXUS Cycle #${this.cycleCount} ==========\n`);

    const ctx: AgentContext = {
      cycle: this.cycleCount,
      timestamp: Date.now(),
      memory: this.memory.getState(),
    };

    const results: Record<string, AgentResult> = {};

    // --- Step 1: Load memory (already done in ctx) ---
    console.log("[Hub] Step 1: Memory loaded");

    // --- Steps 2-5: Gather data in parallel (graceful degradation) ---
    // SecurityLayer: verify each agent's DataBoundary before execution
    console.log("[Hub] Steps 2-5: Gathering data in parallel...");
    this.boundaries.market.canRead("market");
    this.boundaries.onchain.canRead("onchain");
    this.boundaries.sentiment.canRead("market");
    this.boundaries.competitor.canRead("market");

    const [marketResult, onChainResult, fearGreedResult, competitorResult] =
      await Promise.allSettled([
        this.marketAgent.run(ctx),
        this.onChainAgent.run(ctx),
        this.fearGreedAgent.run(ctx),
        this.competitorAgent.run(ctx),
      ]);

    results.market = this.unwrapResult(marketResult, this.marketAgent);
    results.onchain = this.unwrapResult(onChainResult, this.onChainAgent);
    results.feargreed = this.unwrapResult(fearGreedResult, this.fearGreedAgent);
    results.competitor = this.unwrapResult(competitorResult, this.competitorAgent);

    // Enrich context with gathered data
    ctx.marketData = results.market.data;
    ctx.onChainData = results.onchain.data;
    ctx.fearGreedData = results.feargreed.data;
    ctx.competitorData = results.competitor.data;

    // --- Step 6: MiroFish swarm vote ---
    console.log("[Hub] Step 6: MiroFish swarm voting...");
    try {
      const consensus = await this.mirofish.vote(ctx);
      ctx.swarmConsensus = consensus;
      console.log(`[Hub] Swarm consensus: ${consensus.direction} @ ${(consensus.confidence * 100).toFixed(1)}%`);
    } catch (err) {
      console.error("[Hub] MiroFish swarm failed, continuing without:", err);
    }

    // --- Step 7-8: Prediction synthesis + Kelly sizing ---
    console.log("[Hub] Steps 7-8: Prediction synthesis + Kelly sizing...");
    const predResult = await this.predictionAgent.run(ctx);
    results.prediction = predResult;

    const prediction = predResult.success
      ? (predResult.data as PredictionOutput)
      : null;

    if (prediction) {
      ctx.prediction = prediction;
      this.memory.recordPrediction(prediction);
      console.log(
        `[Hub] Prediction: ${prediction.direction} @ ${(prediction.confidence * 100).toFixed(1)}% | Kelly: ${prediction.kellySizePercent.toFixed(2)}%`
      );
    }

    // --- Step 9: Content generation ---
    console.log("[Hub] Step 9: Generating content...");
    const contentResult = await this.contentAgent.run(ctx);
    results.content = contentResult;

    // --- Step 10: Telegram delivery ---
    console.log("[Hub] Step 10: Telegram delivery...");
    if (prediction) {
      const summary = this.buildTelegramSummary(prediction, results);
      await sendMessage(summary);
    }

    // SecurityLayer: check for DataBoundary violations during this cycle
    const violations = Object.values(this.boundaries)
      .flatMap((b) => b.getViolations());
    if (violations.length > 0) {
      const alert = `🔐 *Security Violations (Cycle #${this.cycleCount})*\n${violations.join("\n")}`;
      console.warn(alert);
      await sendMessage(alert);
    }

    const totalMs = Date.now() - cycleStart;
    console.log(`\n[Hub] Cycle #${this.cycleCount} complete in ${totalMs}ms\n`);

    return { cycle: this.cycleCount, results, prediction };
  }

  /**
   * Run engagement check separately (different cadence: every 30min).
   */
  async runEngagement(ctx: AgentContext): Promise<AgentResult> {
    return this.engagementAgent.run(ctx);
  }

  private unwrapResult(
    settled: PromiseSettledResult<AgentResult>,
    agent: { name: string; fallback: () => unknown }
  ): AgentResult {
    if (settled.status === "fulfilled") return settled.value;
    console.warn(`[Hub] ${agent.name} rejected, using fallback`);
    return {
      agent: agent.name,
      success: false,
      data: agent.fallback(),
      error: String(settled.reason),
      durationMs: 0,
    };
  }

  private buildTelegramSummary(
    prediction: PredictionOutput,
    results: Record<string, AgentResult>
  ): string {
    const emoji =
      prediction.direction === "bullish"
        ? "📈"
        : prediction.direction === "bearish"
          ? "📉"
          : "➡️";

    const agentStatus = Object.entries(results)
      .map(([name, r]) => `${r.success ? "✅" : "⚠️"} ${name}: ${r.durationMs}ms`)
      .join("\n");

    return [
      `${emoji} *NEXUS Cycle #${this.cycleCount}*`,
      "",
      `*${prediction.symbol}*: ${prediction.direction.toUpperCase()}`,
      `Confidence: ${(prediction.confidence * 100).toFixed(1)}%`,
      `Kelly Size: ${prediction.kellySizePercent.toFixed(2)}%`,
      "",
      `Sources:`,
      ...prediction.sources.map(
        (s) => `• ${s.name}: ${s.direction} (${(s.confidence * 100).toFixed(0)}%)`
      ),
      "",
      `Agent Status:`,
      agentStatus,
    ].join("\n");
  }

  getMemory(): NexusMemory {
    return this.memory;
  }
}

// --- CLI entry point ---
if (require.main === module) {
  (async () => {
    console.log("Starting NEXUS HubAgent test cycle...\n");
    const hub = new HubAgent();
    const result = await hub.runCycle();
    console.log("\n--- Final Result ---");
    console.log(JSON.stringify(result.prediction, null, 2));
    process.exit(0);
  })();
}
