/**
 * StrategistAgent — Final synthesis layer. The Upgrade core.
 *
 * Takes all signals from every domain, runs them through the HERMES swarm,
 * and produces the daily strategic briefing with actionable positions.
 */

import type {
  HermesContext,
  HermesBriefing,
  Signal,
  ThreatLevel,
} from "../shared/hermes-types";
import { HermesSwarm } from "../mirofish/hermes-swarm";

export class StrategistAgent {
  readonly name = "StrategistAgent";
  private swarm = new HermesSwarm();

  async synthesize(ctx: HermesContext): Promise<HermesBriefing> {
    console.log(`[${this.name}] Running strategic synthesis...`);

    // Run HERMES swarm deliberation
    const consensus = await this.swarm.deliberate(ctx);
    ctx.swarmConsensus = consensus;
    ctx.positions = consensus.recommendedPositions;

    // Aggregate all signals
    const allSignals: Signal[] = [
      ...ctx.geopolitical,
      ...ctx.alpha,
      ...ctx.industry,
      ...ctx.devIntel,
      ...ctx.smartMoney,
    ];

    // Identify critical alerts (immediate attention needed)
    const criticalAlerts = allSignals.filter(
      (s) => s.threatLevel === "critical" || (s.threatLevel === "high" && s.direction === "threat")
    );

    // Determine market regime
    const marketRegime = this.assessRegime(allSignals);

    // Build the headline
    const headline = this.buildHeadline(
      consensus.recommendedPositions[0]?.type ?? "monitor",
      criticalAlerts.length,
      allSignals.length,
      marketRegime
    );

    const briefing: HermesBriefing = {
      cycle: ctx.cycle,
      timestamp: Date.now(),
      headline,
      criticalAlerts,
      topPositions: consensus.recommendedPositions,
      signalCounts: {
        geopolitical: ctx.geopolitical.length,
        "market-alpha": ctx.alpha.length,
        industry: ctx.industry.length,
        "dev-intel": ctx.devIntel.length,
        "smart-money": ctx.smartMoney.length,
      },
      overallThreatlevel: this.assessOverallThreat(allSignals),
      marketRegime,
      actionRequired: criticalAlerts.length > 0 || consensus.recommendedPositions.some(
        (p) => p.urgency === "immediate" || p.urgency === "this-week"
      ),
      fullSignals: allSignals,
    };

    console.log(`[${this.name}] Briefing ready: "${headline}"`);
    return briefing;
  }

  private assessRegime(signals: Signal[]): "risk-on" | "risk-off" | "transitioning" | "uncertain" {
    const threats = signals.filter((s) => s.direction === "threat").length;
    const opportunities = signals.filter((s) => s.direction === "opportunity").length;
    const shifts = signals.filter((s) => s.direction === "shift").length;
    const total = Math.max(signals.length, 1);

    const threatRatio = threats / total;
    const oppRatio = opportunities / total;
    const shiftRatio = shifts / total;

    if (oppRatio > 0.5 && threatRatio < 0.2) return "risk-on";
    if (threatRatio > 0.4) return "risk-off";
    if (shiftRatio > 0.3) return "transitioning";
    return "uncertain";
  }

  private assessOverallThreat(signals: Signal[]): ThreatLevel {
    const criticals = signals.filter((s) => s.threatLevel === "critical").length;
    const highs = signals.filter((s) => s.threatLevel === "high").length;

    if (criticals >= 2) return "critical";
    if (criticals >= 1 || highs >= 3) return "high";
    if (highs >= 1) return "medium";
    return "low";
  }

  private buildHeadline(
    topPosition: string,
    criticalCount: number,
    totalSignals: number,
    regime: string
  ): string {
    if (criticalCount > 0) {
      return `ALERT: ${criticalCount} critical signal${criticalCount > 1 ? "s" : ""} — ${topPosition.toUpperCase()} recommended. ${totalSignals} signals scanned.`;
    }
    return `${regime.toUpperCase()} regime | ${topPosition.toUpperCase()} recommended | ${totalSignals} signals processed.`;
  }
}
