/**
 * agora-demo.ts — watch the agents talk to each other.
 *
 * Feeds synthetic signals into the Roundtable + two-round swarm debate so
 * the conversation layer can be observed without any API keys or network.
 * The scenario is engineered to trigger every mechanism:
 *
 *  - convergence   (industry + dev-intel both flag AI)
 *  - contradiction (alpha sees BTC opportunity, smart money sees BTC exit)
 *  - lone wolf     (uncorroborated critical geopolitical event)
 *  - debate        (risk challenges scout; timeline's exit cascades caution;
 *                   contrarian fades unanimity when it appears)
 *
 * Run: npx ts-node scripts/agora-demo.ts
 */

import { Agora } from "../shared/agora";
import { RoundtableAgent } from "../hermes/agents/RoundtableAgent";
import { StrategistAgent } from "../hermes/agents/StrategistAgent";
import type {
  HermesContext,
  GeopoliticalSignal,
  AlphaSignal,
  IndustrySignal,
  DevIntelSignal,
  SmartMoneySignal,
} from "../hermes/shared/hermes-types";

const now = Date.now();

const geopolitical: GeopoliticalSignal[] = [
  {
    id: "geo-1", domain: "geopolitical", eventType: "sanctions",
    title: "New sanctions package targets exchange settlement rails",
    summary: "Sanctions expansion hits crypto settlement infrastructure used by offshore exchanges.",
    direction: "threat", threatLevel: "high", confidence: 0.75,
    source: "demo", affectedSectors: ["finance", "crypto"], timestamp: now,
    tags: ["sanctions", "finance", "crypto"], countries: ["US", "RU"], impactHorizon: "immediate",
  },
  {
    id: "geo-2", domain: "geopolitical", eventType: "military",
    title: "Naval incident near key shipping chokepoint",
    summary: "Escalation at a strait carrying 20% of global LNG. No other domain sees this yet.",
    direction: "threat", threatLevel: "critical", confidence: 0.7,
    source: "demo", affectedSectors: ["energy", "commodities"], timestamp: now,
    tags: ["military", "energy"], countries: ["IR"], impactHorizon: "immediate",
  },
];

const alpha: AlphaSignal[] = [
  {
    id: "alpha-1", domain: "market-alpha", alphaType: "correlation-break",
    title: "Correlation Break: BTC decoupling upward from risk assets",
    summary: "BTC +4% while equities and alts flat — historically precedes continuation.",
    direction: "opportunity", threatLevel: "medium", confidence: 0.65,
    source: "AlphaScanner", affectedSectors: ["crypto", "finance"], timestamp: now,
    tags: ["correlation-break", "btc"], asset: "BTC", edgePercent: 4.2,
    timeHorizon: "days", decayRate: 0.15,
  },
];

const industry: IndustrySignal[] = [
  {
    id: "ind-1", domain: "industry", shiftType: "emergence",
    title: "AI agent infrastructure spending accelerating",
    summary: "Enterprise budgets shifting to agentic AI tooling; category forming fast.",
    direction: "opportunity", threatLevel: "low", confidence: 0.7,
    source: "demo", affectedSectors: ["ai", "technology"], timestamp: now,
    tags: ["emergence", "ai"], sector: "ai", momentum: "accelerating", competitorMoves: [],
  },
];

const devIntel: DevIntelSignal[] = [
  {
    id: "dev-1", domain: "dev-intel", devType: "paradigm-shift",
    title: "Multi-agent orchestration frameworks trending on GitHub",
    summary: "Agent-to-agent communication frameworks up 300% in stars this quarter.",
    direction: "opportunity", threatLevel: "low", confidence: 0.68,
    source: "GitHub", affectedSectors: ["ai", "technology"], timestamp: now,
    tags: ["paradigm-shift", "ai"], technology: "ai", adoptionStage: "growing",
  },
];

const smartMoney: SmartMoneySignal[] = [
  {
    id: "sm-1", domain: "smart-money", flowType: "whale-distribution",
    title: "Exchange whale wallets distributing BTC into strength",
    summary: "Two tracked whale wallets moved BTC to exchanges during the rally.",
    direction: "threat", threatLevel: "high", confidence: 0.6,
    source: "Etherscan", affectedSectors: ["crypto"], timestamp: now,
    tags: ["whale-distribution", "btc"], asset: "BTC", amountUsd: 180_000_000, isContrarian: true,
  },
];

(async () => {
  console.log("=".repeat(60));
  console.log("AGORA DEMO — the agency talks to itself");
  console.log("=".repeat(60));

  const ctx: HermesContext = {
    cycle: 999, timestamp: now, signals: [],
    geopolitical, alpha, industry, devIntel, smartMoney,
    positions: [],
  };

  const agora = new Agora();

  console.log("\n--- ROUNDTABLE: cross-domain crossfire ---\n");
  const roundtable = new RoundtableAgent();
  ctx.angles = roundtable.convene(ctx, agora);

  for (const angle of ctx.angles) {
    console.log(`  [${angle.kind}] (${(angle.confidence * 100).toFixed(0)}%) ${angle.title}`);
    console.log(`     ${angle.insight}\n`);
  }

  console.log("--- SWARM: two-round debate ---\n");
  const strategist = new StrategistAgent();
  const briefing = await strategist.synthesize(ctx, agora);

  console.log("\n--- AGORA TRANSCRIPT ---\n");
  for (const line of agora.narrate(50)) console.log(`  ${line}`);

  console.log("\n--- BRIEFING ---\n");
  console.log(`  Headline: ${briefing.headline}`);
  console.log(`  Regime: ${briefing.marketRegime} | Threat: ${briefing.overallThreatlevel}`);
  console.log(`  Debate: ${briefing.debateSummary}`);
  console.log(`  Angles: ${briefing.angles.length}`);
  console.log(`  Position: ${briefing.topPositions.map((p) => p.type).join(", ")}`);
})();
