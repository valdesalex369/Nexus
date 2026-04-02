/**
 * NEXUS configuration — loaded from environment variables.
 */

import dotenv from "dotenv";
dotenv.config();

function env(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (!v) return fallback;
  return v.toLowerCase() === "true";
}

export const config = {
  // --- Feature flags ---
  teams: {
    enabled: envBool("NEXUS_TEAMS_ENABLED", true),
    maxAgentsPerTeam: envInt("NEXUS_MAX_AGENTS_PER_TEAM", 10),
    parallelExecution: envBool("NEXUS_PARALLEL_EXECUTION", true),
  },

  // --- API keys ---
  telegram: {
    botToken: env("TELEGRAM_BOT_TOKEN"),
    chatId: env("TELEGRAM_CHAT_ID"),
  },
  etherscan: {
    apiKey: env("ETHERSCAN_API_KEY"),
  },
  coingecko: {
    baseUrl: env("COINGECKO_BASE_URL", "https://api.coingecko.com/api/v3"),
  },
  twitter: {
    bearerToken: env("TWITTER_BEARER_TOKEN"),
    username: env("TWITTER_USERNAME", "Xelarocket"),
  },
  kalshi: {
    apiKey: env("KALSHI_API_KEY"),
    apiSecret: env("KALSHI_API_SECRET"),
    environment: env("KALSHI_ENV", "demo") as "demo" | "live",
    baseUrl: env(
      "KALSHI_BASE_URL",
      "https://demo-api.kalshi.co/trade-api/v2"
    ),
  },
  fearGreed: {
    baseUrl: env(
      "FEAR_GREED_URL",
      "https://api.alternative.me/fng/"
    ),
  },
  wallet: {
    address: env("WALLET_ADDRESS"),
  },

  // --- Timing (ms) ---
  intervals: {
    hubCycleMs: envInt("HUB_CYCLE_MS", 15 * 60 * 1000),       // 15 min
    engagementMs: envInt("ENGAGEMENT_MS", 30 * 60 * 1000),     // 30 min
    fearGreedMs: envInt("FEAR_GREED_MS", 6 * 60 * 60 * 1000),  // 6h
    competitorCron: env("COMPETITOR_CRON", "0 8 * * *"),        // 8am daily
    recalibrationCron: env("RECALIBRATION_CRON", "0 2 * * *"), // 2am daily
  },

  // --- Limits ---
  kellyMaxPercent: envInt("KELLY_MAX_PERCENT", 5),
  minEdgePercent: envInt("MIN_EDGE_PERCENT", 4),
  paperTradesRequired: envInt("PAPER_TRADES_REQUIRED", 50),

  // --- Server ---
  server: {
    port: envInt("SERVER_PORT", 3001),
  },
} as const;
