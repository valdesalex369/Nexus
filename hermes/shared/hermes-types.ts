/**
 * HERMES Type System — Human-Enhanced Real-time Market & Economic Strategy
 *
 * Every type here maps to a real intelligence domain. Nothing is abstract
 * for the sake of being abstract — each type drives a concrete agent.
 */

// ---------------------------------------------------------------------------
// SIGNAL — the atomic unit of intelligence
// ---------------------------------------------------------------------------

export type SignalDomain =
  | "geopolitical"
  | "market-alpha"
  | "industry"
  | "dev-intel"
  | "smart-money";

export type ThreatLevel = "critical" | "high" | "medium" | "low" | "info";

export type SignalDirection = "opportunity" | "threat" | "shift" | "neutral";

export interface Signal {
  id: string;
  domain: SignalDomain;
  title: string;
  summary: string;
  direction: SignalDirection;
  threatLevel: ThreatLevel;
  confidence: number; // 0-1
  source: string;
  sourceUrl?: string;
  affectedSectors: string[];
  timestamp: number;
  expiresAt?: number; // signals can decay
  tags: string[];
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// GEOPOLITICAL
// ---------------------------------------------------------------------------

export type GeoEventType =
  | "sanctions"
  | "trade-policy"
  | "energy-policy"
  | "regulation"
  | "election"
  | "central-bank"
  | "military"
  | "treaty"
  | "tariff"
  | "technology-ban";

export interface GeopoliticalSignal extends Signal {
  domain: "geopolitical";
  eventType: GeoEventType;
  countries: string[];
  impactHorizon: "immediate" | "weeks" | "months" | "years";
}

// ---------------------------------------------------------------------------
// MARKET ALPHA — statistical arbitrage & inefficiency detection
// ---------------------------------------------------------------------------

export type AlphaType =
  | "stat-arb"          // statistical arbitrage
  | "sentiment-diverge" // sentiment vs price divergence
  | "flow-imbalance"    // order flow imbalance
  | "correlation-break" // historical correlation broken
  | "momentum-shift"    // momentum regime change
  | "volatility-regime" // vol regime transition
  | "mispricing";       // clear mispricing vs fair value

export interface AlphaSignal extends Signal {
  domain: "market-alpha";
  alphaType: AlphaType;
  asset: string;
  edgePercent: number;
  sharpeEstimate?: number;
  timeHorizon: "minutes" | "hours" | "days" | "weeks";
  decayRate: number; // how fast the edge disappears (0-1 per hour)
}

// ---------------------------------------------------------------------------
// INDUSTRY RADAR — macro sector shifts
// ---------------------------------------------------------------------------

export type IndustryShiftType =
  | "consolidation"     // M&A, market concentration
  | "disruption"        // new tech displacing incumbents
  | "emergence"         // new category forming
  | "regulation-shift"  // regulatory environment changing
  | "capital-flow"      // investment dollars moving
  | "talent-migration"  // where engineers are going
  | "supply-chain";     // supply chain restructuring

export interface IndustrySignal extends Signal {
  domain: "industry";
  shiftType: IndustryShiftType;
  sector: string;
  subsector?: string;
  momentum: "accelerating" | "steady" | "decelerating";
  competitorMoves: string[];
}

// ---------------------------------------------------------------------------
// DEV INTEL — GitHub, tech stack, developer ecosystem
// ---------------------------------------------------------------------------

export type DevSignalType =
  | "trending-repo"     // fast-rising GitHub repo
  | "stack-shift"       // technology adoption changing
  | "tool-emergence"    // new developer tool gaining traction
  | "deprecation"       // tech being sunset
  | "security-vuln"     // critical vulnerability
  | "paradigm-shift";   // fundamental dev methodology change

export interface DevIntelSignal extends Signal {
  domain: "dev-intel";
  devType: DevSignalType;
  technology: string;
  githubStars?: number;
  weeklyGrowthPercent?: number;
  adoptionStage: "emerging" | "growing" | "mainstream" | "declining";
}

// ---------------------------------------------------------------------------
// SMART MONEY — institutional & whale flow tracking
// ---------------------------------------------------------------------------

export type FlowType =
  | "whale-accumulation"
  | "whale-distribution"
  | "vc-funding"
  | "insider-buy"
  | "insider-sell"
  | "institutional-filing"
  | "treasury-move";

export interface SmartMoneySignal extends Signal {
  domain: "smart-money";
  flowType: FlowType;
  entity?: string;       // who (if known)
  asset: string;
  amountUsd: number;
  isContrarian: boolean; // going against the crowd?
}

// ---------------------------------------------------------------------------
// STRATEGIC POSITION — the output of synthesis
// ---------------------------------------------------------------------------

export type PositionType =
  | "build"       // build this product/skill/business
  | "learn"       // invest time learning this
  | "allocate"    // allocate capital here
  | "avoid"       // stay away, risk too high
  | "hedge"       // protect against this risk
  | "monitor"     // watch closely, not actionable yet
  | "exit";       // get out of this position/market

export interface StrategicPosition {
  id: string;
  type: PositionType;
  title: string;
  thesis: string;          // why this position exists
  confidence: number;      // 0-1, from swarm consensus
  urgency: "immediate" | "this-week" | "this-month" | "this-quarter";
  sectors: string[];
  supportingSignals: string[]; // signal IDs
  contraindicators: string[];  // signals arguing against
  riskScore: number;       // 0-1, higher = riskier
  timeHorizon: string;
  actionItems: string[];   // concrete next steps
  timestamp: number;
}

// ---------------------------------------------------------------------------
// HERMES CONTEXT — what flows through the pipeline
// ---------------------------------------------------------------------------

export interface HermesContext {
  cycle: number;
  timestamp: number;
  signals: Signal[];
  geopolitical: GeopoliticalSignal[];
  alpha: AlphaSignal[];
  industry: IndustrySignal[];
  devIntel: DevIntelSignal[];
  smartMoney: SmartMoneySignal[];
  positions: StrategicPosition[];
  swarmConsensus?: HermesSwarmConsensus;
}

// ---------------------------------------------------------------------------
// HERMES SWARM — strategic voting (not trading)
// ---------------------------------------------------------------------------

export interface HermesSwarmVote {
  agentId: string;
  strategy: string;
  position: PositionType;
  thesis: string;
  confidence: number;
  dissent: boolean;
  riskAssessment: number; // 0-1
}

export interface HermesSwarmConsensus {
  recommendedPositions: StrategicPosition[];
  votes: HermesSwarmVote[];
  dissentPenalty: number;
  overallConfidence: number;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// HERMES BRIEFING — the daily output
// ---------------------------------------------------------------------------

export interface HermesBriefing {
  cycle: number;
  timestamp: number;
  headline: string;
  criticalAlerts: Signal[];
  topPositions: StrategicPosition[];
  signalCounts: Record<SignalDomain, number>;
  overallThreatlevel: ThreatLevel;
  marketRegime: "risk-on" | "risk-off" | "transitioning" | "uncertain";
  actionRequired: boolean;
  fullSignals: Signal[];
}

// ---------------------------------------------------------------------------
// N8N WORKFLOW DEFINITION
// ---------------------------------------------------------------------------

export interface N8NWorkflowNode {
  id: string;
  name: string;
  type: string;
  position: [number, number];
  parameters: Record<string, unknown>;
}

export interface N8NWorkflow {
  name: string;
  nodes: N8NWorkflowNode[];
  connections: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }>;
}
