/**
 * WAYFINDER — "what should we investigate next?"
 *
 * Commercial opportunities are scored on evidence-backed economics. Research
 * opportunities are gated separately so unknown dollars/probabilities are never
 * invented merely to produce a ranking.
 */

export type OpportunityKind = 'commercial' | 'research';
export type WayfinderStatus = 'SCORED' | 'RESEARCH_PRIORITY' | 'INSUFFICIENT_EVIDENCE' | 'VETOED';

export interface EconomicEvidence {
  estimated: boolean;
  provenance?: string;
  rationale?: string;
}

export interface Opportunity {
  id: string;
  title: string;
  source: string;
  kind?: OpportunityKind;

  valueUsd?: number;
  probability?: number;
  startupCostUsd?: number;
  economicEvidence?: EconomicEvidence;

  questionValue?: number;
  resolutionProbability?: number;
  evidenceAccess?: number;

  daysToFirstSignal: number;
  technicalDifficulty: number;
  distributionDifficulty: number;
  grossMargin: number;
  repeatability: number;
  automationPotential: number;
  competitivePressure: number;
  capabilityFit: number;
  reversibility: number;
  downsideSeverity: number;
}

export interface ScoreComponent {
  name: string;
  value: number;
  rationale: string;
}

export interface ScoredOpportunity {
  opportunity: Opportunity;
  score: number;
  components: ScoreComponent[];
  veto: string | null;
  gate: string | null;
  status: WayfinderStatus;
  scoreType: 'commercial_ev' | 'research_learning' | 'none';
  rank: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function ruinVeto(o: Opportunity): string | null {
  if (o.downsideSeverity >= 0.7 && o.reversibility <= 0.3) {
    return `downside is severe (${o.downsideSeverity.toFixed(2)}) and hard to reverse `
      + `(${o.reversibility.toFixed(2)}) — an average cannot justify a bet you cannot undo`;
  }
  return null;
}

function commercialGate(o: Opportunity): string | null {
  if (o.valueUsd === undefined || o.probability === undefined || o.startupCostUsd === undefined) {
    return 'INSUFFICIENT_EVIDENCE: commercial economics are unknown; value, probability, and startup cost must be evidence-backed';
  }
  if (![o.valueUsd, o.probability, o.startupCostUsd].every(Number.isFinite)) {
    return 'INSUFFICIENT_EVIDENCE: commercial economics contain a non-finite value';
  }
  if (o.economicEvidence?.estimated) {
    if (!o.economicEvidence.provenance?.trim() || !o.economicEvidence.rationale?.trim()) {
      return 'INSUFFICIENT_EVIDENCE: estimated economics require provenance and rationale';
    }
  }
  return null;
}

function researchGate(o: Opportunity): string | null {
  if (o.questionValue === undefined || o.resolutionProbability === undefined || o.evidenceAccess === undefined) {
    return 'INSUFFICIENT_EVIDENCE: research priority requires questionValue, resolutionProbability, and evidenceAccess';
  }
  return null;
}

function researchScore(o: Opportunity): ScoredOpportunity {
  const veto = ruinVeto(o);
  if (veto) {
    return { opportunity: o, score: 0, components: [], veto, gate: null,
      status: 'VETOED', scoreType: 'none', rank: 0 };
  }
  const gate = researchGate(o);
  if (gate) {
    return { opportunity: o, score: 0, components: [], veto: null, gate,
      status: 'INSUFFICIENT_EVIDENCE', scoreType: 'none', rank: 0 };
  }

  const q = clamp01(o.questionValue!);
  const r = clamp01(o.resolutionProbability!);
  const e = clamp01(o.evidenceAccess!);
  const timePenalty = 1 + Math.max(o.daysToFirstSignal, 0) / 7;
  const learning = clamp01((q * r * e) / timePenalty);
  const components: ScoreComponent[] = [
    { name: 'question_value', value: q, rationale: `question value ${q.toFixed(2)}` },
    { name: 'resolution_probability', value: r, rationale: `resolution probability ${r.toFixed(2)}` },
    { name: 'evidence_access', value: e, rationale: `evidence access ${e.toFixed(2)}` },
    { name: 'speed_to_signal', value: clamp01(7 / Math.max(o.daysToFirstSignal, 0.5)),
      rationale: `${o.daysToFirstSignal} days to first checkable signal` },
  ];
  return { opportunity: o, score: learning, components, veto: null, gate: null,
    status: 'RESEARCH_PRIORITY', scoreType: 'research_learning', rank: 0 };
}

export function score(o: Opportunity): ScoredOpportunity {
  if ((o.kind ?? 'commercial') === 'research') return researchScore(o);

  const veto = ruinVeto(o);
  if (veto) {
    return { opportunity: o, score: 0, components: [], veto, gate: null,
      status: 'VETOED', scoreType: 'none', rank: 0 };
  }
  const gate = commercialGate(o);
  if (gate) {
    return { opportunity: o, score: 0, components: [], veto: null, gate,
      status: 'INSUFFICIENT_EVIDENCE', scoreType: 'none', rank: 0 };
  }

  if (o.probability! <= 0 || o.valueUsd! <= 0) {
    const noUpside = 'no credible upside: probability or value is zero';
    return { opportunity: o, score: 0, components: [], veto: noUpside, gate: null,
      status: 'VETOED', scoreType: 'none', rank: 0 };
  }

  const components: ScoreComponent[] = [];
  const add = (name: string, value: number, rationale: string) => {
    components.push({ name, value, rationale });
    return value;
  };

  const ev = o.valueUsd! * clamp01(o.probability!);
  const capital = Math.max(o.startupCostUsd!, 1);
  const evRatio = ev / capital;
  const evScore = add('expected_value', clamp01(evRatio / (evRatio + 3)),
    `$${ev.toFixed(0)} expected against $${o.startupCostUsd!.toFixed(0)} at risk (${evRatio.toFixed(1)}x)`);
  const speed = add('speed_to_signal', clamp01(7 / Math.max(o.daysToFirstSignal, 0.5)),
    `${o.daysToFirstSignal} days to first checkable signal (1 week = 1.0)`);
  const feasibility = add('feasibility',
    clamp01(1 - (0.4 * clamp01(o.technicalDifficulty) + 0.6 * clamp01(o.distributionDifficulty))),
    `technical ${o.technicalDifficulty.toFixed(2)}, distribution ${o.distributionDifficulty.toFixed(2)} — distribution weighted higher because it usually binds`);
  const durability = add('durability',
    clamp01(0.35 * o.grossMargin + 0.3 * o.repeatability + 0.35 * o.automationPotential),
    `margin ${o.grossMargin.toFixed(2)}, repeatability ${o.repeatability.toFixed(2)}, automation ${o.automationPotential.toFixed(2)}`);
  const moat = add('competitive_position', clamp01(1 - o.competitivePressure),
    `competitive pressure ${o.competitivePressure.toFixed(2)}`);
  const fit = add('capability_fit', clamp01(o.capabilityFit),
    `uses ${(o.capabilityFit * 100).toFixed(0)}% existing capability`);
  const safety = add('reversibility', clamp01(o.reversibility),
    `reversibility ${o.reversibility.toFixed(2)}, downside ${o.downsideSeverity.toFixed(2)}`);

  const weights: Record<string, number> = {
    expected_value: 0.26, speed_to_signal: 0.16, feasibility: 0.14,
    durability: 0.14, competitive_position: 0.08, capability_fit: 0.12, reversibility: 0.10,
  };
  const raw = evScore * weights.expected_value!
    + speed * weights.speed_to_signal!
    + feasibility * weights.feasibility!
    + durability * weights.durability!
    + moat * weights.competitive_position!
    + fit * weights.capability_fit!
    + safety * weights.reversibility!;

  return { opportunity: o, score: clamp01(raw), components, veto: null, gate: null,
    status: 'SCORED', scoreType: 'commercial_ev', rank: 0 };
}

export function rank(opportunities: Opportunity[]): ScoredOpportunity[] {
  const order: Record<WayfinderStatus, number> = {
    SCORED: 0, RESEARCH_PRIORITY: 1, INSUFFICIENT_EVIDENCE: 2, VETOED: 3,
  };
  return opportunities
    .map(score)
    .sort((a, b) => order[a.status] - order[b.status] || b.score - a.score)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

export function explain(scored: ScoredOpportunity[]): string {
  return scored.map((s) => {
    const head = `#${s.rank}  ${s.status}  ${s.score.toFixed(3)}  ${s.opportunity.title}`;
    const veto = s.veto ? `\n      VETOED: ${s.veto}` : '';
    const gate = s.gate ? `\n      GATE: ${s.gate}` : '';
    const parts = s.components
      .map((c) => `      ${c.name.padEnd(21)} ${c.value.toFixed(3)}  ${c.rationale}`)
      .join('\n');
    return `${head}${veto}${gate}${parts ? `\n${parts}` : ''}`;
  }).join('\n\n');
}
