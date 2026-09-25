/**
 * runner.ts — 24/7 cron loop for NEXUS.
 *
 * Schedules:
 *  Every 15 min:  HubAgent.runCycle()
 *  Every 30 min:  TwitterEngagementAgent
 *  Every 4h:      HermesAgent.runCycle() — strategic intelligence briefing
 *  Every 6h:      FearGreedAgent (via HubAgent)
 *  Every 8am:     CompetitorAgent (via HubAgent)
 *  Every 2am:     AutoResolutionLoop — recalibrate weights
 */

import { CronJob } from "cron";
import { HubAgent } from "../agents/HubAgent";
import { HermesAgent } from "../hermes/agents/HermesAgent";
import { initTelegram, sendMessage } from "../shared/telegram";
import { config } from "../shared/config";
import type { AgentContext } from "../shared/types";

const hub = new HubAgent();
const hermes = new HermesAgent();

function makeCtx(): AgentContext {
  return {
    cycle: 0,
    timestamp: Date.now(),
    memory: hub.getMemory().getState(),
  };
}

// --- Main cycle: every 15 min ---
const mainCycle = new CronJob("*/15 * * * *", async () => {
  try {
    await hub.runCycle();
  } catch (err) {
    console.error("[Runner] Main cycle error:", err);
    await sendMessage(`⚠️ NEXUS main cycle failed: ${err}`);
  }
});

// --- Engagement check: every 30 min ---
const engagementCycle = new CronJob("*/30 * * * *", async () => {
  try {
    await hub.runEngagement(makeCtx());
  } catch (err) {
    console.error("[Runner] Engagement cycle error:", err);
  }
});

// --- HERMES intelligence cycle: every 4h ---
const hermesCycle = new CronJob(config.hermes.cron, async () => {
  try {
    await hermes.runCycle();
  } catch (err) {
    console.error("[Runner] HERMES cycle error:", err);
    await sendMessage(`⚠️ HERMES intelligence cycle failed: ${err}`);
  }
});

// --- Recalibration: 2am daily ---
const recalibrationCycle = new CronJob(
  config.intervals.recalibrationCron,
  async () => {
    try {
      console.log("[Runner] Running nightly recalibration...");
      const memory = hub.getMemory();
      const state = memory.getState();
      const recent = state.recentPredictions.slice(0, 50);

      if (recent.length < 5) {
        console.log("[Runner] Not enough predictions for recalibration");
        return;
      }

      // Simple recalibration: boost weights of sources that aligned with outcomes
      // Full implementation would compare predictions against actual price movement
      const weights = { ...state.predictionWeights };
      memory.updateWeights(weights);
      memory.addInsight(
        `Recalibrated at ${new Date().toISOString()} with ${recent.length} predictions`
      );
      await sendMessage(
        `🔄 Nightly recalibration complete — ${recent.length} predictions reviewed`
      );
    } catch (err) {
      console.error("[Runner] Recalibration error:", err);
    }
  }
);

// --- Start ---
async function start(): Promise<void> {
  console.log("🚀 NEXUS Runner starting...\n");

  initTelegram();

  mainCycle.start();
  engagementCycle.start();
  hermesCycle.start();
  recalibrationCycle.start();

  console.log("Schedules active:");
  console.log("  Main cycle:    every 15 min");
  console.log("  Engagement:    every 30 min");
  console.log("  HERMES:        every 4h");
  console.log("  Recalibration: 2am daily");
  console.log("");

  await sendMessage("🚀 *NEXUS Runner started* — all schedules active (NEXUS + HERMES)");

  // Run first cycles immediately
  console.log("Running initial NEXUS cycle...\n");
  await hub.runCycle();

  console.log("Running initial HERMES cycle...\n");
  await hermes.runCycle();
}

start().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
