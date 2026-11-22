/**
 * HermesAgent — Central orchestrator for the HERMES intelligence system.
 *
 * Pipeline:
 *  1. Initialize context
 *  2. GeopoliticalAgent → sanctions, policy, central banks
 *  3. AlphaScanner → statistical arbitrage, sentiment divergence
 *  4. IndustryRadar → sector shifts, disruption, emergence
 *  5. DevIntelAgent → GitHub trends, tech stack, tools
 *  6. SmartMoneyAgent → whale flows, VC funding, institutional moves
 *  7. StrategistAgent → MiroFish swarm deliberation + synthesis
 *  8. Deliver briefing via Telegram
 *
 * Steps 2-6 run in parallel. Each agent has graceful degradation.
 */

import { GeopoliticalAgent } from "./GeopoliticalAgent";
import { AlphaScanner } from "./AlphaScanner";
import { IndustryRadar } from "./IndustryRadar";
import { DevIntelAgent } from "./DevIntelAgent";
import { SmartMoneyAgent } from "./SmartMoneyAgent";
import { StrategistAgent } from "./StrategistAgent";
import { RoundtableAgent } from "./RoundtableAgent";
import { Agora } from "../../shared/agora";
import { sanitizeOutput } from "../../shared/security";
import { sendMessage } from "../../shared/telegram";
import { NexusMemory } from "../../shared/memory/NexusMemory";
import type {
  HermesContext,
  HermesBriefing,
  GeopoliticalSignal,
  AlphaSignal,
  IndustrySignal,
  DevIntelSignal,
  SmartMoneySignal,
} from "../shared/hermes-types";

export class HermesAgent {
  private cycleCount = 0;

  // Intelligence agents
  private geo = new GeopoliticalAgent();
  private alpha = new AlphaScanner();
  private industry = new IndustryRadar();
  private devIntel = new DevIntelAgent();
  private smartMoney = new SmartMoneyAgent();
  private roundtable = new RoundtableAgent();
  private strategist = new StrategistAgent();
  private memory = new NexusMemory();

  async runCycle(): Promise<HermesBriefing> {
    this.cycleCount++;
    const start = Date.now();
    console.log(`\n========== HERMES Cycle #${this.cycleCount} ==========\n`);

    // Step 1: Initialize context
    const ctx: HermesContext = {
      cycle: this.cycleCount,
      timestamp: Date.now(),
      signals: [],
      geopolitical: [],
      alpha: [],
      industry: [],
      devIntel: [],
      smartMoney: [],
      positions: [],
    };

    // Steps 2-6: Gather intelligence in parallel (graceful degradation)
    console.log("[Hermes] Gathering intelligence from 5 domains in parallel...");
    const [geoResult, alphaResult, industryResult, devResult, smartResult] =
      await Promise.allSettled([
        this.geo.gather(ctx),
        this.alpha.gather(ctx),
        this.industry.gather(ctx),
        this.devIntel.gather(ctx),
        this.smartMoney.gather(ctx),
      ]);

    ctx.geopolitical = this.unwrap(geoResult, this.geo) as GeopoliticalSignal[];
    ctx.alpha = this.unwrap(alphaResult, this.alpha) as AlphaSignal[];
    ctx.industry = this.unwrap(industryResult, this.industry) as IndustrySignal[];
    ctx.devIntel = this.unwrap(devResult, this.devIntel) as DevIntelSignal[];
    ctx.smartMoney = this.unwrap(smartResult, this.smartMoney) as SmartMoneySignal[];

    const totalSignals =
      ctx.geopolitical.length +
      ctx.alpha.length +
      ctx.industry.length +
      ctx.devIntel.length +
      ctx.smartMoney.length;

    console.log(`[Hermes] ${totalSignals} total signals gathered`);
    console.log(`  Geopolitical: ${ctx.geopolitical.length}`);
    console.log(`  Alpha:        ${ctx.alpha.length}`);
    console.log(`  Industry:     ${ctx.industry.length}`);
    console.log(`  DevIntel:     ${ctx.devIntel.length}`);
    console.log(`  SmartMoney:   ${ctx.smartMoney.length}`);

    // Step 6.5: The agents talk to each other.
    // Roundtable cross-examines domains; the Agora carries the conversation
    // into the swarm debate so votes happen WITH cross-domain context.
    const agora = new Agora();
    ctx.angles = this.roundtable.convene(ctx, agora);

    // Step 7: Strategic synthesis (two-round swarm debate + strategist)
    console.log("[Hermes] Running strategic synthesis...");
    const briefing = await this.strategist.synthesize(ctx, agora);
    ctx.agora = agora.transcript();

    // Persistent dissents after debate are angles too — a thesis someone
    // still holds against the majority is exactly what you can't see alone.
    for (const vote of ctx.swarmConsensus?.votes ?? []) {
      if (vote.dissent && !vote.revised) {
        briefing.angles.push({
          kind: "dissent",
          title: `${vote.strategy} still says ${vote.position.toUpperCase()}`,
          insight: vote.thesis,
          agents: [vote.agentId],
          signalIds: [],
          confidence: vote.confidence,
        });
      }
    }

    if (agora.size > 0) {
      console.log(`[Hermes] Agora transcript (${agora.size} messages):`);
      for (const line of agora.narrate(10)) console.log(`  ${line}`);
    }

    // Step 8: Deliver briefing
    console.log("[Hermes] Delivering briefing...");
    await this.deliverBriefing(briefing);

    // Step 9: Bridge — the strategy brain teaches the trading brain.
    // Top angles persist into NexusMemory so NEXUS cycles inherit what
    // the HERMES conversation surfaced. (NexusMemory sanitizes on write.)
    for (const angle of briefing.angles.slice(0, 3)) {
      this.memory.addInsight(`[HERMES ${angle.kind}] ${angle.title}: ${angle.insight}`);
    }

    const elapsed = Date.now() - start;
    console.log(`\n[Hermes] Cycle #${this.cycleCount} complete in ${elapsed}ms\n`);

    return briefing;
  }

  private unwrap<T>(
    result: PromiseSettledResult<T>,
    agent: { name: string; fallback: () => T }
  ): T {
    if (result.status === "fulfilled") return result.value;
    console.warn(`[Hermes] ${agent.name} failed, using fallback:`, result.reason);
    return agent.fallback();
  }

  private async deliverBriefing(briefing: HermesBriefing): Promise<void> {
    const lines: string[] = [
      `🧠 *HERMES Briefing #${briefing.cycle}*`,
      "",
      `*${briefing.headline}*`,
      "",
      `Regime: *${briefing.marketRegime.toUpperCase()}*`,
      `Threat Level: *${briefing.overallThreatlevel.toUpperCase()}*`,
      `Action Required: ${briefing.actionRequired ? "YES" : "No"}`,
      "",
      `📊 *Signal Counts*`,
      `  Geopolitical: ${briefing.signalCounts.geopolitical}`,
      `  Market Alpha: ${briefing.signalCounts["market-alpha"]}`,
      `  Industry:     ${briefing.signalCounts.industry}`,
      `  Dev Intel:    ${briefing.signalCounts["dev-intel"]}`,
      `  Smart Money:  ${briefing.signalCounts["smart-money"]}`,
    ];

    if (briefing.criticalAlerts.length > 0) {
      lines.push("", "🚨 *Critical Alerts*");
      for (const alert of briefing.criticalAlerts.slice(0, 5)) {
        lines.push(`  • ${alert.title}`);
      }
    }

    if (briefing.angles.length > 0) {
      lines.push("", "🔍 *Angles You Don't See*");
      for (const angle of briefing.angles.slice(0, 4)) {
        lines.push(`  *[${angle.kind}]* ${angle.title}`);
        lines.push(`  ${angle.insight.slice(0, 220)}`);
      }
    }

    lines.push("", `🗣 Debate: ${briefing.debateSummary}`);

    if (briefing.topPositions.length > 0) {
      lines.push("", "🎯 *Recommended Positions*");
      for (const pos of briefing.topPositions) {
        lines.push(`  *${pos.type.toUpperCase()}* (${(pos.confidence * 100).toFixed(0)}% confidence)`);
        lines.push(`  ${pos.thesis.slice(0, 200)}`);
        if (pos.actionItems.length > 0) {
          lines.push("  Actions:");
          for (const action of pos.actionItems) {
            lines.push(`    → ${action}`);
          }
        }
      }
    }

    const message = sanitizeOutput(lines.join("\n"));
    await sendMessage(message);
  }
}

// CLI entry point
if (require.main === module) {
  (async () => {
    console.log("Starting HERMES intelligence cycle...\n");
    const hermes = new HermesAgent();
    const briefing = await hermes.runCycle();
    console.log("\n--- Briefing ---");
    console.log(`Headline: ${briefing.headline}`);
    console.log(`Regime: ${briefing.marketRegime}`);
    console.log(`Threat: ${briefing.overallThreatlevel}`);
    console.log(`Positions: ${briefing.topPositions.map((p) => p.type).join(", ")}`);
    process.exit(0);
  })();
}
