/**
 * HERMES MiroFish Strategic Swarm — 5 voting agents for strategic positioning.
 *
 * Unlike the trading swarm (bullish/bearish), this swarm votes on
 * WHAT TO DO: build, learn, allocate, avoid, hedge, monitor, exit.
 *
 * Agents:
 *  1. MacroThinker   — systemic, long-term structural analysis
 *  2. Contrarian     — fades consensus, looks for crowded trades
 *  3. RiskAssessor   — quantifies downside, tail risks, fragility
 *  4. OpportunityScout — finds asymmetric bets, high-upside moves
 *  5. TimelineAnalyst — when, not just what; urgency and sequencing
 */

import { Agora } from "../../shared/agora";
import type {
  HermesContext,
  HermesSwarmVote,
  HermesSwarmConsensus,
  StrategicPosition,
  PositionType,
  Signal,
} from "../shared/hermes-types";

const DISSENT_PENALTY = 0.12; // per dissenting agent

const AGGRESSIVE: PositionType[] = ["allocate", "build"];
const DEFENSIVE: PositionType[] = ["hedge", "avoid", "exit"];

interface SwarmAgent {
  id: string;
  strategy: string;
  evaluate: (signals: Signal[], ctx: HermesContext) => HermesSwarmVote[];
}

// --- 1. MacroThinker: structural, long-term, systemic ---
const macroThinker: SwarmAgent = {
  id: "hermes-macro",
  strategy: "macro-thinker",
  evaluate(signals) {
    const votes: HermesSwarmVote[] = [];

    // Count signals by domain and direction
    const threatCount = signals.filter((s) => s.direction === "threat").length;
    const oppCount = signals.filter((s) => s.direction === "opportunity").length;
    const geoSignals = signals.filter((s) => s.domain === "geopolitical");
    const industrySignals = signals.filter((s) => s.domain === "industry");

    // If heavy geopolitical risk, recommend hedging
    if (geoSignals.filter((s) => s.threatLevel === "critical" || s.threatLevel === "high").length >= 2) {
      votes.push({
        agentId: "hermes-macro",
        strategy: "macro-thinker",
        position: "hedge",
        thesis: `${geoSignals.length} geopolitical risks detected (${geoSignals.filter((s) => s.threatLevel === "critical").length} critical). Systemic risk is elevated — protect positions.`,
        confidence: 0.8,
        dissent: false,
        riskAssessment: 0.7,
      });
    }

    // If more opportunities than threats, recommend building
    if (oppCount > threatCount * 1.5 && industrySignals.length > 0) {
      votes.push({
        agentId: "hermes-macro",
        strategy: "macro-thinker",
        position: "build",
        thesis: `${oppCount} opportunities vs ${threatCount} threats. Industry shifts favor building in ${industrySignals.map((s) => (s as any).sector).filter(Boolean).join(", ")}.`,
        confidence: 0.7,
        dissent: false,
        riskAssessment: 0.3,
      });
    }

    if (votes.length === 0) {
      votes.push({
        agentId: "hermes-macro",
        strategy: "macro-thinker",
        position: "monitor",
        thesis: "No clear macro thesis. Mixed signals — continue monitoring.",
        confidence: 0.5,
        dissent: false,
        riskAssessment: 0.4,
      });
    }

    return votes;
  },
};

// --- 2. Contrarian: fades consensus, looks for crowded trades ---
const contrarian: SwarmAgent = {
  id: "hermes-contrarian",
  strategy: "contrarian",
  evaluate(signals) {
    const votes: HermesSwarmVote[] = [];

    // If everyone is bearish, look for opportunity
    const threatRatio = signals.filter((s) => s.direction === "threat").length / Math.max(signals.length, 1);
    if (threatRatio > 0.6) {
      votes.push({
        agentId: "hermes-contrarian",
        strategy: "contrarian",
        position: "allocate",
        thesis: `${(threatRatio * 100).toFixed(0)}% of signals are threats — crowd is fearful. Contrarian allocation opportunity when fear is consensus.`,
        confidence: 0.6,
        dissent: false,
        riskAssessment: 0.5,
      });
    }

    // If everyone is bullish, recommend caution
    const oppRatio = signals.filter((s) => s.direction === "opportunity").length / Math.max(signals.length, 1);
    if (oppRatio > 0.7) {
      votes.push({
        agentId: "hermes-contrarian",
        strategy: "contrarian",
        position: "hedge",
        thesis: `${(oppRatio * 100).toFixed(0)}% opportunity signals — consensus euphoria is dangerous. Hedge peak optimism.`,
        confidence: 0.55,
        dissent: false,
        riskAssessment: 0.6,
      });
    }

    if (votes.length === 0) {
      votes.push({
        agentId: "hermes-contrarian",
        strategy: "contrarian",
        position: "monitor",
        thesis: "No extreme consensus to fade. Market is not crowded in either direction.",
        confidence: 0.4,
        dissent: false,
        riskAssessment: 0.3,
      });
    }

    return votes;
  },
};

// --- 3. RiskAssessor: quantifies downside, tail risks, fragility ---
const riskAssessor: SwarmAgent = {
  id: "hermes-risk",
  strategy: "risk-assessor",
  evaluate(signals) {
    const votes: HermesSwarmVote[] = [];

    const criticals = signals.filter((s) => s.threatLevel === "critical");
    const highs = signals.filter((s) => s.threatLevel === "high");
    const riskScore = (criticals.length * 3 + highs.length) / Math.max(signals.length, 1);

    if (riskScore > 0.5) {
      votes.push({
        agentId: "hermes-risk",
        strategy: "risk-assessor",
        position: "avoid",
        thesis: `Risk score: ${(riskScore * 100).toFixed(0)}%. ${criticals.length} critical + ${highs.length} high threat signals. Reduce exposure until risk subsides.`,
        confidence: 0.75,
        dissent: false,
        riskAssessment: riskScore,
      });
    } else if (riskScore > 0.25) {
      votes.push({
        agentId: "hermes-risk",
        strategy: "risk-assessor",
        position: "hedge",
        thesis: `Moderate risk (${(riskScore * 100).toFixed(0)}%). Maintain positions but with hedges in place.`,
        confidence: 0.6,
        dissent: false,
        riskAssessment: riskScore,
      });
    } else {
      votes.push({
        agentId: "hermes-risk",
        strategy: "risk-assessor",
        position: "build",
        thesis: `Low risk environment (${(riskScore * 100).toFixed(0)}%). Conditions favor deployment of capital and effort.`,
        confidence: 0.65,
        dissent: false,
        riskAssessment: riskScore,
      });
    }

    return votes;
  },
};

// --- 4. OpportunityScout: asymmetric bets, high-upside ---
const opportunityScout: SwarmAgent = {
  id: "hermes-scout",
  strategy: "opportunity-scout",
  evaluate(signals) {
    const votes: HermesSwarmVote[] = [];

    // Look for emerging tech signals
    const devSignals = signals.filter((s) => s.domain === "dev-intel" && s.direction === "opportunity");
    if (devSignals.length > 0) {
      votes.push({
        agentId: "hermes-scout",
        strategy: "opportunity-scout",
        position: "learn",
        thesis: `${devSignals.length} emerging tech opportunities detected. Investing time now creates asymmetric advantage: ${devSignals.slice(0, 3).map((s) => s.title).join("; ")}.`,
        confidence: 0.7,
        dissent: false,
        riskAssessment: 0.2,
      });
    }

    // Look for high-edge alpha signals
    const alphaSignals = signals.filter((s) => s.domain === "market-alpha" && s.direction === "opportunity");
    if (alphaSignals.length > 0) {
      votes.push({
        agentId: "hermes-scout",
        strategy: "opportunity-scout",
        position: "allocate",
        thesis: `${alphaSignals.length} alpha opportunities with edge. Markets are giving edge — deploy capital where conviction is highest.`,
        confidence: 0.65,
        dissent: false,
        riskAssessment: 0.35,
      });
    }

    // Look for smart money accumulation
    const accumulation = signals.filter((s) => s.domain === "smart-money" && s.direction === "opportunity");
    if (accumulation.length >= 2) {
      votes.push({
        agentId: "hermes-scout",
        strategy: "opportunity-scout",
        position: "allocate",
        thesis: `Smart money accumulating across ${accumulation.length} signals. Follow institutional conviction.`,
        confidence: 0.6,
        dissent: false,
        riskAssessment: 0.3,
      });
    }

    if (votes.length === 0) {
      votes.push({
        agentId: "hermes-scout",
        strategy: "opportunity-scout",
        position: "monitor",
        thesis: "No asymmetric opportunities surfaced this cycle.",
        confidence: 0.4,
        dissent: false,
        riskAssessment: 0.2,
      });
    }

    return votes;
  },
};

// --- 5. TimelineAnalyst: urgency and sequencing ---
const timelineAnalyst: SwarmAgent = {
  id: "hermes-timeline",
  strategy: "timeline-analyst",
  evaluate(signals) {
    const votes: HermesSwarmVote[] = [];

    const immediateThreats = signals.filter(
      (s) => s.direction === "threat" && s.threatLevel === "critical"
    );

    if (immediateThreats.length > 0) {
      votes.push({
        agentId: "hermes-timeline",
        strategy: "timeline-analyst",
        position: "exit",
        thesis: `${immediateThreats.length} critical threats require immediate action. Exit exposed positions NOW, then reassess.`,
        confidence: 0.8,
        dissent: false,
        riskAssessment: 0.9,
      });
    }

    // Check for time-sensitive opportunities (decaying alpha)
    const decayingAlpha = signals.filter(
      (s) => s.domain === "market-alpha" && s.direction === "opportunity"
    );
    if (decayingAlpha.length > 0) {
      votes.push({
        agentId: "hermes-timeline",
        strategy: "timeline-analyst",
        position: "allocate",
        thesis: `${decayingAlpha.length} alpha signals with decay. These edges are perishable — act this week or they vanish.`,
        confidence: 0.6,
        dissent: false,
        riskAssessment: 0.4,
      });
    }

    if (votes.length === 0) {
      votes.push({
        agentId: "hermes-timeline",
        strategy: "timeline-analyst",
        position: "monitor",
        thesis: "No time-critical signals. Continue regular cadence.",
        confidence: 0.5,
        dissent: false,
        riskAssessment: 0.2,
      });
    }

    return votes;
  },
};

const SWARM_AGENTS: SwarmAgent[] = [
  macroThinker,
  contrarian,
  riskAssessor,
  opportunityScout,
  timelineAnalyst,
];

export class HermesSwarm {
  async deliberate(ctx: HermesContext, agora?: Agora): Promise<HermesSwarmConsensus> {
    const allSignals = [
      ...ctx.geopolitical,
      ...ctx.alpha,
      ...ctx.industry,
      ...ctx.devIntel,
      ...ctx.smartMoney,
    ];

    const room = agora ?? new Agora();

    // ROUND 1 — independent votes, each posted to the Agora
    const allVotes: HermesSwarmVote[] = [];
    for (const agent of SWARM_AGENTS) {
      const votes = agent.evaluate(allSignals, ctx);
      for (const vote of votes) {
        room.post(
          vote.agentId,
          "all",
          "observation",
          vote.position,
          `votes ${vote.position.toUpperCase()} (${(vote.confidence * 100).toFixed(0)}%): ${vote.thesis}`
        );
      }
      allVotes.push(...votes);
    }

    // ROUND 2 — agents hear each other and may revise.
    // Hard rule: debate only moves positions toward caution or learning.
    // Peer pressure must never talk the swarm into MORE risk.
    this.debateRound(allVotes, room);

    // Tally votes by position type
    const tally = new Map<PositionType, { votes: HermesSwarmVote[]; totalConf: number }>();
    for (const vote of allVotes) {
      const entry = tally.get(vote.position) ?? { votes: [], totalConf: 0 };
      entry.votes.push(vote);
      entry.totalConf += vote.confidence;
      tally.set(vote.position, entry);
    }

    // Find majority position
    let majorityPosition: PositionType = "monitor";
    let maxConf = 0;
    for (const [position, { totalConf }] of tally) {
      if (totalConf > maxConf) {
        maxConf = totalConf;
        majorityPosition = position;
      }
    }

    // Mark dissenters
    const majorityVotes = tally.get(majorityPosition)?.votes ?? [];
    let dissentCount = 0;
    for (const vote of allVotes) {
      if (vote.position !== majorityPosition && vote.position !== "monitor") {
        vote.dissent = true;
        dissentCount++;
      }
    }

    const dissentPenalty = Math.min(dissentCount * DISSENT_PENALTY, 0.5);
    const avgConfidence =
      majorityVotes.reduce((sum, v) => sum + v.confidence, 0) / Math.max(majorityVotes.length, 1);
    const overallConfidence = avgConfidence * (1 - dissentPenalty);

    // Build strategic positions from majority consensus
    const recommendedPositions = this.buildPositions(majorityPosition, majorityVotes, allSignals);

    const revisions = allVotes.filter((v) => v.revised).length;
    console.log(
      `[HermesSwarm] ${allVotes.length} votes | majority: ${majorityPosition} | ` +
      `${dissentCount} dissenters | ${revisions} revised in debate | ` +
      `penalty: ${(dissentPenalty * 100).toFixed(0)}% | ` +
      `confidence: ${(overallConfidence * 100).toFixed(1)}%`
    );

    return {
      recommendedPositions,
      votes: allVotes,
      dissentPenalty,
      overallConfidence,
      timestamp: Date.now(),
    };
  }

  /**
   * The debate: each agent reacts to what peers said in round 1.
   * All revisions are one-directional — toward caution or learning.
   */
  private debateRound(votes: HermesSwarmVote[], room: Agora): void {
    const byAgent = (id: string) => votes.filter((v) => v.agentId === id);
    const risk = byAgent("hermes-risk")[0];
    const timeline = byAgent("hermes-timeline");

    // 1. RiskAssessor challenges aggressive votes when risk is elevated;
    //    OpportunityScout downgrades allocate → learn under high risk.
    if (risk && risk.riskAssessment >= 0.5) {
      for (const vote of votes) {
        if (vote.agentId !== "hermes-risk" && AGGRESSIVE.includes(vote.position)) {
          room.post(
            "hermes-risk",
            vote.agentId,
            "challenge",
            vote.position,
            `challenges ${vote.agentId}'s ${vote.position.toUpperCase()}: risk score is ${(risk.riskAssessment * 100).toFixed(0)}%. What's the downside if the critical signals are right?`
          );
          if (vote.agentId === "hermes-scout" && vote.position === "allocate") {
            vote.initialPosition = vote.position;
            vote.position = "learn";
            vote.revised = true;
            vote.confidence = Math.max(vote.confidence - 0.05, 0.3);
            vote.thesis += " [Revised after RiskAssessor challenge: research the edge first, deploy only if it survives scrutiny.]";
            room.post(
              "hermes-scout",
              "all",
              "revision",
              "learn",
              `revises ALLOCATE → LEARN. RiskAssessor's downside case stands — validate the edge before capital moves.`
            );
          }
        }
      }
    }

    // 2. TimelineAnalyst's EXIT (critical threats) cascades caution:
    //    aggressive peers step down to hedge.
    if (timeline.some((v) => v.position === "exit")) {
      for (const vote of votes) {
        if (AGGRESSIVE.includes(vote.position)) {
          vote.initialPosition = vote.position;
          vote.position = "hedge";
          vote.revised = true;
          vote.thesis += " [Revised: TimelineAnalyst flags critical time-sensitive threats — defense first.]";
          room.post(
            vote.agentId,
            "all",
            "revision",
            "hedge",
            `revises ${vote.initialPosition?.toUpperCase()} → HEDGE after TimelineAnalyst's critical-threat call.`
          );
        }
      }
    }

    // 3. Contrarian fades uniform consensus: if every non-contrarian agent
    //    lands aggressive, that unanimity is itself a crowded trade.
    const nonContrarian = votes.filter((v) => v.agentId !== "hermes-contrarian");
    const uniformAggressive =
      nonContrarian.length >= 3 && nonContrarian.every((v) => AGGRESSIVE.includes(v.position));
    if (uniformAggressive) {
      for (const vote of byAgent("hermes-contrarian")) {
        if (!DEFENSIVE.includes(vote.position)) {
          vote.initialPosition = vote.position;
          vote.position = "hedge";
          vote.revised = true;
          vote.confidence = Math.min(vote.confidence + 0.15, 0.75);
          vote.thesis = `Every other agent is aggressive simultaneously — unanimity IS the crowded trade. ${vote.thesis}`;
        }
        room.post(
          "hermes-contrarian",
          "all",
          "challenge",
          "hedge",
          `challenges the room: all peers voted aggressive at once. When everyone agrees, someone isn't thinking. Hedging the consensus.`
        );
      }
    }
  }

  private buildPositions(
    positionType: PositionType,
    votes: HermesSwarmVote[],
    signals: Signal[]
  ): StrategicPosition[] {
    const avgRisk = votes.reduce((s, v) => s + v.riskAssessment, 0) / Math.max(votes.length, 1);
    const avgConf = votes.reduce((s, v) => s + v.confidence, 0) / Math.max(votes.length, 1);

    const supportingIds = signals
      .filter((s) => s.direction === "opportunity" || s.direction === "shift")
      .slice(0, 5)
      .map((s) => s.id);

    const contraindicatorIds = signals
      .filter((s) => s.direction === "threat")
      .slice(0, 3)
      .map((s) => s.id);

    const actionItems = this.deriveActions(positionType, votes);

    return [
      {
        id: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: positionType,
        title: `${positionType.toUpperCase()}: Strategic recommendation from HERMES swarm`,
        thesis: votes.map((v) => v.thesis).join(" | "),
        confidence: avgConf,
        urgency: positionType === "exit" ? "immediate" : positionType === "allocate" ? "this-week" : "this-month",
        sectors: [...new Set(signals.flatMap((s) => s.affectedSectors).slice(0, 5))],
        supportingSignals: supportingIds,
        contraindicators: contraindicatorIds,
        riskScore: avgRisk,
        timeHorizon: positionType === "build" || positionType === "learn" ? "3-6 months" : "1-4 weeks",
        actionItems,
        timestamp: Date.now(),
      },
    ];
  }

  private deriveActions(positionType: PositionType, votes: HermesSwarmVote[]): string[] {
    switch (positionType) {
      case "build":
        return [
          "Identify top opportunity from signals",
          "Scope MVP in most promising sector",
          "Allocate 2-4 hours daily to building",
        ];
      case "learn":
        return [
          "Identify emerging tech from DevIntel signals",
          "Dedicate 1 hour daily to learning the top tool",
          "Build a small project with it within 1 week",
        ];
      case "allocate":
        return [
          "Review alpha signals for highest-edge opportunities",
          "Size positions using Kelly Criterion",
          "Submit via Telegram /approve before executing",
        ];
      case "hedge":
        return [
          "Review current exposure across all positions",
          "Identify cheapest hedges for top risks",
          "Reduce position sizes by 20-30%",
        ];
      case "avoid":
        return [
          "Do not deploy new capital this cycle",
          "Review and reduce existing exposure",
          "Wait for risk signals to clear",
        ];
      case "exit":
        return [
          "Close exposed positions immediately",
          "Move to cash/stablecoins",
          "Reassess after risk event passes",
        ];
      case "monitor":
        return [
          "Continue regular scanning cadence",
          "No action required — signals are mixed",
          "Reassess at next cycle",
        ];
      default:
        return ["Review signals and reassess"];
    }
  }
}
