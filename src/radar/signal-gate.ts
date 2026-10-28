/**
 * Signal promotion gate for Opportunity Radar.
 * Separates a successful source-processing run from an independently useful alert.
 * No authority to trade, publish, contact third parties, or spend money.
 * All inputs are evidence metadata: SHA-256 format is checked here, not cryptographic content.
 */
export type SignalDecision = 'SUPPRESS' | 'RESEARCH_ONLY' | 'HUMAN_REVIEW';
export type SignalReason =
  | 'INVALID_SOURCE_EVIDENCE'
  | 'INVALID_PUBLICATION_DATE'
  | 'FUTURE_PUBLICATION_DATE'
  | 'STALE_SOURCE'
  | 'UNCHANGED_EVENT'
  | 'FIXTURE_NOT_LIVE'
  | 'SINGLE_SOURCE'
  | 'UNVALIDATED_ECONOMICS'
  | 'OPEN_UNCERTAINTY'
  | 'OPPORTUNITY_VETO'
  | 'LOW_SCORE';

export interface SignalGateInput {
  asOf: string;
  mode: 'LIVE' | 'FIXTURE';
  delta: 'BASELINE' | 'UNCHANGED' | 'NEW_DOCUMENT';
  sourceId: string;
  sourceUrl: string | null;
  sourceSha256: string;
  publishedOn: string; // strict YYYY-MM-DD, from source document
  observedClaimProvenances: string[][];
  independentSourceIds: string[]; // externally corroborated, NOT just links repeating one article
  validatedBuyerEvidenceRefs: string[]; // demonstrated commercial value, not assumptions
  unknownClaims: number;
  opportunityScore: number;
  opportunityVeto: boolean;
  economicsAreExperimental: boolean;
  maxAgeDays?: number;
  promotionThreshold?: number;
}

export interface SignalGateResult {
  schemaVersion: 'nexus.signal-gate.v1';
  decision: SignalDecision;
  reasons: SignalReason[];
  evaluatedAt: string;
  externalActionAllowed: false;
  /** A HUMAN_REVIEW is an escalation suggestion, never an automatic order. */
}

const sha256 = /^[a-f0-9]{64}$/i;
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

export function evaluateSignal(input: SignalGateInput): SignalGateResult {
  const asOf = new Date(input.asOf);
  if (!Number.isFinite(asOf.getTime())) throw new Error('asOf must be a valid ISO timestamp');
  const maxAgeDays = input.maxAgeDays ?? 14;
  const threshold = input.promotionThreshold ?? 0.75;
  if (!Number.isInteger(maxAgeDays) || maxAgeDays < 0 || maxAgeDays > 365) throw new Error('invalid maxAgeDays');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('invalid promotionThreshold');
  const reasons: SignalReason[] = [];
  const suppress = (code: SignalReason): void => { reasons.push(code); };

  const urlValid = input.mode === 'FIXTURE'
    ? true
    : Boolean(input.sourceUrl && /^https:\/\//i.test(input.sourceUrl));
  if (!input.sourceId.trim() || !urlValid || !sha256.test(input.sourceSha256)
      || !input.observedClaimProvenances.some((refs) => refs.includes(input.sourceId))) {
    suppress('INVALID_SOURCE_EVIDENCE');
  }

  const day = isoDay.test(input.publishedOn) ? new Date(input.publishedOn + 'T00:00:00.000Z') : new Date(NaN);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== input.publishedOn) {
    suppress('INVALID_PUBLICATION_DATE');
  } else {
    const asOfDay = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
    const age = (asOfDay - day.getTime()) / 86_400_000;
    if (age < 0) suppress('FUTURE_PUBLICATION_DATE');
    if (age > maxAgeDays) suppress('STALE_SOURCE');
  }
  if (input.delta === 'UNCHANGED') suppress('UNCHANGED_EVENT');
  if (input.mode === 'FIXTURE') reasons.push('FIXTURE_NOT_LIVE');

  const independent = new Set(input.independentSourceIds.filter((id) => id && id !== input.sourceId));
  if (independent.size === 0) reasons.push('SINGLE_SOURCE');
  if (input.economicsAreExperimental || input.validatedBuyerEvidenceRefs.length === 0) {
    reasons.push('UNVALIDATED_ECONOMICS');
  }
  if (input.unknownClaims > 0) reasons.push('OPEN_UNCERTAINTY');
  if (input.opportunityVeto) reasons.push('OPPORTUNITY_VETO');
  if (!Number.isFinite(input.opportunityScore) || input.opportunityScore < threshold || input.opportunityScore > 1) {
    reasons.push('LOW_SCORE');
  }

  const blockerCodes = new Set<SignalReason>([
    'INVALID_SOURCE_EVIDENCE', 'INVALID_PUBLICATION_DATE',
    'FUTURE_PUBLICATION_DATE', 'STALE_SOURCE', 'UNCHANGED_EVENT',
  ]);
  const decision: SignalDecision = reasons.some((code) => blockerCodes.has(code))
    ? 'SUPPRESS'
    : reasons.length > 0 ? 'RESEARCH_ONLY' : 'HUMAN_REVIEW';
  return {
    schemaVersion: 'nexus.signal-gate.v1',
    decision,
    reasons,
    evaluatedAt: asOf.toISOString(),
    externalActionAllowed: false,
  };
}
