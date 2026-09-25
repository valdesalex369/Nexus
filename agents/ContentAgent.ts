/**
 * ContentAgent — Generates X threads and daily digests from prediction data.
 *
 * All content goes through Telegram /approve before posting.
 */

import { BaseAgent } from "./BaseAgent";
import type {
  AgentContext,
  ContentDraft,
  MarketSnapshot,
  PredictionOutput,
} from "../shared/types";

export class ContentAgent extends BaseAgent {
  constructor() {
    super("ContentAgent", "content");
  }

  protected async execute(ctx: AgentContext): Promise<{
    drafts: ContentDraft[];
  }> {
    const prediction = ctx.prediction as PredictionOutput | undefined;
    const snapshots = ((ctx.marketData as any)?.snapshots ?? []) as MarketSnapshot[];

    const drafts: ContentDraft[] = [];

    if (prediction) {
      drafts.push(this.buildThread(prediction, snapshots));
    }

    drafts.push(this.buildDailyDigest(prediction, snapshots, ctx));

    return { drafts };
  }

  private buildThread(
    prediction: PredictionOutput,
    snapshots: MarketSnapshot[]
  ): ContentDraft {
    const btc = snapshots.find((s) => s.symbol === "BTC");
    const priceStr = btc ? `$${btc.price.toLocaleString()}` : "N/A";
    const emoji =
      prediction.direction === "bullish"
        ? "📈"
        : prediction.direction === "bearish"
          ? "📉"
          : "➡️";

    const sourceSummary = prediction.sources
      .map((s) => `• ${s.name}: ${s.direction} (${(s.confidence * 100).toFixed(0)}%)`)
      .join("\n");

    const text = [
      `${emoji} NEXUS Signal — ${prediction.symbol}`,
      "",
      `Direction: ${prediction.direction.toUpperCase()}`,
      `Confidence: ${(prediction.confidence * 100).toFixed(1)}%`,
      `BTC Price: ${priceStr}`,
      `Kelly Size: ${prediction.kellySizePercent.toFixed(2)}%`,
      "",
      `Sources:`,
      sourceSummary,
      "",
      `#crypto #AI #trading`,
    ].join("\n");

    return {
      platform: "twitter",
      type: "thread",
      text,
      approved: false,
      createdAt: Date.now(),
    };
  }

  private buildDailyDigest(
    prediction: PredictionOutput | undefined,
    snapshots: MarketSnapshot[],
    ctx: AgentContext
  ): ContentDraft {
    const lines: string[] = ["📊 NEXUS Daily Digest", ""];

    for (const snap of snapshots) {
      const arrow = snap.change24h >= 0 ? "▲" : "▼";
      lines.push(
        `${snap.symbol}: $${snap.price.toLocaleString()} ${arrow} ${snap.change24h.toFixed(2)}%`
      );
    }

    if (prediction) {
      lines.push("");
      lines.push(
        `Signal: ${prediction.direction.toUpperCase()} @ ${(prediction.confidence * 100).toFixed(1)}% confidence`
      );
    }

    lines.push("");
    lines.push(`Win rate: ${(ctx.memory.winRate * 100).toFixed(1)}%`);
    lines.push(`Total cycles: ${ctx.memory.totalCycles}`);

    return {
      platform: "telegram",
      type: "digest",
      text: lines.join("\n"),
      approved: false,
      createdAt: Date.now(),
    };
  }

  override fallback() {
    return { drafts: [] };
  }
}
