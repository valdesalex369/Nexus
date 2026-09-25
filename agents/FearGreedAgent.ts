/**
 * FearGreedAgent — Fetches the crypto Fear & Greed index as a sentiment signal.
 *
 * Used as the 5th prediction source (contrarian indicator).
 * Runs every 6 hours.
 */

import axios from "axios";
import { BaseAgent } from "./BaseAgent";
import { config } from "../shared/config";
import type { AgentContext, FearGreedReading } from "../shared/types";

export class FearGreedAgent extends BaseAgent {
  constructor() {
    super("FearGreedAgent", "sentiment");
  }

  protected async execute(_ctx: AgentContext): Promise<FearGreedReading> {
    return this.fetchFearGreed();
  }

  private async fetchFearGreed(): Promise<FearGreedReading> {
    try {
      const { data } = await axios.get(config.fearGreed.baseUrl, {
        params: { limit: 2 },
        timeout: 10_000,
      });

      const current = data.data?.[0];
      const previous = data.data?.[1];

      if (!current) {
        throw new Error("No Fear & Greed data returned");
      }

      const value = parseInt(current.value, 10);
      return {
        value,
        label: current.value_classification,
        timestamp: parseInt(current.timestamp, 10) * 1000,
        previousClose: previous ? parseInt(previous.value, 10) : value,
      };
    } catch (err) {
      console.error("[FearGreedAgent] Fetch failed:", err);
      // Return neutral fallback
      return {
        value: 50,
        label: "Neutral",
        timestamp: Date.now(),
        previousClose: 50,
      };
    }
  }

  override fallback(): FearGreedReading {
    return { value: 50, label: "Neutral", timestamp: Date.now(), previousClose: 50 };
  }
}
