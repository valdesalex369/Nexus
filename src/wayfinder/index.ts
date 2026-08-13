/**
 * WAYFINDER — "what should we investigate next?"
 *
 * Scores opportunities so the ranking can be argued with. Every score decomposes
 * into named components; there is no single opaque number. If Alex disagrees with
 * a ranking, he should be able to point at the component that is wrong.
 *
 * Two deliberate rules, both from the directive:
 *
 *   1. NOVELTY IS NOT OPPORTUNITY. "New" contributes nothing to the score. A
 *      thing scores because of expected value, cost, and reversibility.
 *
 *   2. AN IRREVERSIBLE CATASTROPHE CANNOT BE OUTRANKED BY UPSIDE. Expected value
 *      is an average, and averages hide ruin. An opportunity whose downside is
 *      severe *and* irreversible is vetoed outright rather than discounted —
 *      because you only need to be wrong once.
 */

export interface Opportunity {
  id: string;
  title: string;
  /** Where this came from: a discovery event id, a URL, a conversation. */
  source: string;

  // --- Value ---
  /** Upside in USD if it works. */
  valueUsd: number;
  /** 0..1 — honest probability it works. */
  probability: number;

  // --- Effort ---
  /** Up-front cost in USD to find out. */
  startupCostUsd: number;
  /** Days until the first checkable signal — not until completion. */
  daysToFirstSignal: number;
  /** 0..1 — 1 is hardest. */
  technicalDifficulty: number;
  /** 0..1 — 1 is hardest. Usually the real constraint, not the build. */
  distributionDifficulty: number;

  // --- Durability ---
  /** 0..1 — how much of the revenue survives as margin. */
  grossMargin: number;
  /** 0..1 — does doing it once make the next one cheaper? */
  repeatability: number;
  /** 0..1 — how much of it can run without a human. */
  automationPotential: number;
  /** 0..1 — 1 means a crowded, brutal market. */
  competitivePressure: number;

  // --- Fit and risk ---
  /** 0..1 — how well it uses capabilities we already have. */
  capabilityFit: number;
  /** 0..1 — 1 means trivially undoable. */
  reversibility: number;
  /** 0..1 — 1 means catastrophic if it goes wrong. */
  downsideSeverity: number;
}

export interface ScoreComponent {
  name: string;
  value: number;
  /** Why this number, in a sentence a human can dispute. */
  rationale: string;
}

export interface ScoredOpportunity {
  opportunity: Opportunity;
  score: number;
  components: ScoreComponent[];
  /** Set when the opportunity is disqualified regardless of its score. */
  veto: string | null;
  rank: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * An opportunity is vetoed when being wrong once would be unrecoverable.
 * Thresholds are deliberately conservative: this is the guard against the system
 * talking itself into a bet it cannot walk back.
 */
function vetoReason(o: Opportunity): string | null {
  if (o.downsideSeverity >= 0.7 && o.reversibility <= 0.3) {
    return `downside is severe (${o.downsideSeverity.toFixed(2)}) and hard to reverse `
      + `(${o.reversibility.toFixed(2)}) — an average cannot justify a bet you cannot undo`;
  }
  if (o.probability <= 0 || o.valueUsd <= 0) {
    return 'no credible upside: probability or value is zero';
  }
  return null;
}

/**
 * Score in [0,1]. Expected value is normalised against startup cost — a
 * $10k upside for $9k of spend is not a good bet — then adjusted by how fast we
 * learn, how durable the thing is, and how well it fits what we can already do.
 */
export function score(o: Opportunity): ScoredOpportunity {
  const components: ScoreComponent[] = [];
  const add = (name: string, value: number, rationale: string) => {
    components.push({ name, value, rationale });
    return value;
  };

  const ev = o.valueUsd * clamp01(o.probability);
  // Return on the money at risk, squashed so huge multiples do not dominate.
  const capital = Math.max(o.startupCostUsd, 1);
  const evRatio = ev / capital;
  const evScore = add('expected_value', clamp01(evRatio / (evRatio + 3)),
    `$${ev.toFixed(0)} expected against $${o.startupCostUsd.toFixed(0)} at risk `
    + `(${evRatio.toFixed(1)}x)`);

  // Learning speed. What matters is time to the first checkable signal.
  const speed = add('speed_to_signal', clamp01(7 / Math.max(o.daysToFirstSignal, 0.5)),
    `${o.daysToFirstSignal} days to first checkable signal (1 week = 1.0)`);

  const feasibility = add('feasibility',
    clamp01(1 - (0.4 * clamp01(o.technicalDifficulty) + 0.6 * clamp01(o.distributionDifficulty))),
    `technical ${o.technicalDifficulty.toFixed(2)}, distribution `
    + `${o.distributionDifficulty.toFixed(2)} — distribution weighted higher because it usually binds`);

  const durability = add('durability',
    clamp01(0.35 * o.grossMargin + 0.3 * o.repeatability + 0.35 * o.automationPotential),
    `margin ${o.grossMargin.toFixed(2)}, repeatability ${o.repeatability.toFixed(2)}, `
    + `automation ${o.automationPotential.toFixed(2)}`);

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

  const veto = vetoReason(o);
  return {
    opportunity: o,
    score: veto ? 0 : clamp01(raw),
    components,
    veto,
    rank: 0,
  };
}

/** Rank a set of opportunities. Vetoed items always sort last, whatever their upside. */
export function rank(opportunities: Opportunity[]): ScoredOpportunity[] {
  return opportunities
    .map(score)
    .sort((a, b) => {
      if (Boolean(a.veto) !== Boolean(b.veto)) return a.veto ? 1 : -1;
      return b.score - a.score;
    })
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

/** Rendered ranking, with the reasoning visible so it can be disputed. */
export function explain(scored: ScoredOpportunity[]): string {
  return scored.map((s) => {
    const head = `#${s.rank}  ${s.score.toFixed(3)}  ${s.opportunity.title}`;
    const veto = s.veto ? `\n      VETOED: ${s.veto}` : '';
    const parts = s.components
      .map((c) => `      ${c.name.padEnd(21)} ${c.value.toFixed(3)}  ${c.rationale}`)
      .join('\n');
    return `${head}${veto}\n${parts}`;
  }).join('\n\n');
}
