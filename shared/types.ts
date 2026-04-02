/**
 * Core types for the NEXUS multi-agent platform.
 */

// --- Agent framework ---

export type AgentStatus = "idle" | "running" | "paused" | "error" | "stopped";

export type AgentRole =
  | "coordinator"
  | "market"
  | "onchain"
  | "prediction"
  | "content"
  | "engagement"
  | "sentiment"
  | "competitor"
  | "custom";

export interface AgentMessage {
  id: string;
  sender: string;
  recipient: string;
  type: string;
  payload: unknown;
  timestamp: number;
}

export interface AgentResult {
  agent: string;
  success: boolean;
  data: unknown;
  error?: string;
  durationMs: number;
}

export interface AgentContext {
  cycle: number;
  timestamp: number;
  memory: NexusMemoryState;
  [key: string]: unknown;
}

// --- Market data ---

export interface MarketSnapshot {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  timestamp: number;
}

export interface OHLCVCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

// --- On-chain data ---

export interface WhaleTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  token: string;
  timestamp: number;
  usdValue?: number;
}

export interface WalletInfo {
  address: string;
  balanceEth: number;
  recentTxCount: number;
  lastActivity: number;
}

// --- Prediction ---

export type PredictionDirection = "bullish" | "bearish" | "neutral";

export interface PredictionSource {
  name: string;
  direction: PredictionDirection;
  confidence: number; // 0-1
  weight: number;     // learned weight
  reasoning: string;
}

export interface PredictionOutput {
  symbol: string;
  direction: PredictionDirection;
  confidence: number;
  sources: PredictionSource[];
  kellySizePercent: number;
  timestamp: number;
}

// --- Fear & Greed ---

export interface FearGreedReading {
  value: number;            // 0-100
  label: string;            // "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
  timestamp: number;
  previousClose: number;
}

// --- Content ---

export interface ContentDraft {
  platform: "twitter" | "telegram";
  type: "thread" | "post" | "digest";
  text: string;
  approved: boolean;
  createdAt: number;
}

// --- MiroFish swarm ---

export interface SwarmVote {
  agentId: string;
  direction: PredictionDirection;
  confidence: number;
  reasoning: string;
  dissent: boolean;
}

export interface SwarmConsensus {
  direction: PredictionDirection;
  confidence: number;
  votes: SwarmVote[];
  dissentPenalty: number;
  timestamp: number;
}

// --- Memory ---

export interface NexusMemoryState {
  predictionWeights: Record<string, number>;
  recentPredictions: PredictionOutput[];
  winRate: number;
  totalCycles: number;
  lastRecalibration: number;
  learnedInsights: string[];
}

// --- Telegram conductor ---

export interface TelegramAction {
  type: "approve" | "deny" | "info";
  target: string;
  payload: unknown;
  requestedAt: number;
  resolvedAt?: number;
}

// --- Kalshi ---

export interface KalshiMarket {
  ticker: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  closeDate: string;
}

export interface KalshiEdge {
  market: KalshiMarket;
  predictedProbability: number;
  marketProbability: number;
  edgePercent: number;
  kellySize: number;
  side: "yes" | "no";
}
