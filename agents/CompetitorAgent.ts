/**
 * CompetitorAgent — Monitors competitor accounts for trading patterns.
 *
 * Tracks @CW8900, @lookonchain, @TraderDune via Twitter API.
 * Runs daily at 8am.
 */

import axios from "axios";
import { BaseAgent } from "./BaseAgent";
import { config } from "../shared/config";
import type { AgentContext, PredictionDirection } from "../shared/types";

const TRACKED_ACCOUNTS = ["CW8900", "lookonchain", "TraderDune"];

interface CompetitorInsight {
  account: string;
  recentTweets: string[];
  detectedDirection: PredictionDirection;
  reasoning: string;
}

export class CompetitorAgent extends BaseAgent {
  constructor() {
    super("CompetitorAgent", "competitor");
  }

  protected async execute(_ctx: AgentContext): Promise<{
    insights: CompetitorInsight[];
    direction: PredictionDirection;
    reasoning: string;
  }> {
    const insights = await this.analyzeCompetitors();
    const { direction, reasoning } = this.synthesize(insights);
    return { insights, direction, reasoning };
  }

  private async analyzeCompetitors(): Promise<CompetitorInsight[]> {
    if (!config.twitter.bearerToken) {
      console.warn("[CompetitorAgent] No TWITTER_BEARER_TOKEN — skipping");
      return [];
    }

    const insights: CompetitorInsight[] = [];

    for (const account of TRACKED_ACCOUNTS) {
      try {
        const tweets = await this.fetchRecentTweets(account);
        const direction = this.detectDirection(tweets);
        insights.push({
          account,
          recentTweets: tweets.slice(0, 5),
          detectedDirection: direction,
          reasoning: `${tweets.length} recent tweets analyzed from @${account}`,
        });
      } catch (err) {
        console.warn(`[CompetitorAgent] Failed to fetch @${account}:`, err);
      }
    }

    return insights;
  }

  private async fetchRecentTweets(username: string): Promise<string[]> {
    try {
      // Step 1: Get user ID
      const userRes = await axios.get(
        `https://api.twitter.com/2/users/by/username/${username}`,
        {
          headers: { Authorization: `Bearer ${config.twitter.bearerToken}` },
          timeout: 10_000,
        }
      );
      const userId = userRes.data?.data?.id;
      if (!userId) return [];

      // Step 2: Get recent tweets
      const tweetsRes = await axios.get(
        `https://api.twitter.com/2/users/${userId}/tweets`,
        {
          params: { max_results: 10, "tweet.fields": "created_at,text" },
          headers: { Authorization: `Bearer ${config.twitter.bearerToken}` },
          timeout: 10_000,
        }
      );

      return (tweetsRes.data?.data ?? []).map((t: any) => t.text as string);
    } catch {
      return [];
    }
  }

  private detectDirection(tweets: string[]): PredictionDirection {
    const text = tweets.join(" ").toLowerCase();
    const bullishWords = ["buy", "long", "bullish", "moon", "pump", "accumulate", "breakout"];
    const bearishWords = ["sell", "short", "bearish", "dump", "crash", "breakdown", "exit"];

    let score = 0;
    for (const word of bullishWords) {
      if (text.includes(word)) score++;
    }
    for (const word of bearishWords) {
      if (text.includes(word)) score--;
    }

    return score > 1 ? "bullish" : score < -1 ? "bearish" : "neutral";
  }

  private synthesize(insights: CompetitorInsight[]): {
    direction: PredictionDirection;
    reasoning: string;
  } {
    if (insights.length === 0) {
      return { direction: "neutral", reasoning: "No competitor data available" };
    }

    let score = 0;
    for (const i of insights) {
      score += i.detectedDirection === "bullish" ? 1 : i.detectedDirection === "bearish" ? -1 : 0;
    }

    const direction: PredictionDirection =
      score > 0 ? "bullish" : score < 0 ? "bearish" : "neutral";

    return {
      direction,
      reasoning: `${insights.length} competitors analyzed: ${insights.map((i) => `@${i.account}=${i.detectedDirection}`).join(", ")}`,
    };
  }

  override fallback() {
    return { insights: [], direction: "neutral" as PredictionDirection, reasoning: "Fallback" };
  }
}
