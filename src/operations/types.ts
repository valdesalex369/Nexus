/**
 * ULTRA INSTINCT Operations Display v0 — shared live-state contract.
 *
 * Every panel consumes the same evidence-bearing object shape so the UI cannot
 * present a claim, opportunity, geospatial event, or operation without provenance,
 * uncertainty, an action state, and a ledger reference.
 */

export type SourceType =
  | 'primary'
  | 'official'
  | 'filing'
  | 'market'
  | 'alternative-data'
  | 'secondary'
  | 'internal';

export type ActionState =
  | 'DETECTED'
  | 'VERIFIED'
  | 'INVESTIGATING'
  | 'HUMAN_GATE'
  | 'EXECUTING'
  | 'RESOLVED'
  | 'FAILED';

export interface EvidenceRef {
  uri: string;
  title?: string;
  observedAt?: string;
  note?: string;
}

export interface RelationRef {
  from: string;
  relation: string;
  to: string;
  confidence?: number;
}

export interface GeoRef {
  /** WGS84 decimal degrees. Omit GeoRef entirely when location is not verified. */
  lat: number;
  lon: number;
  label: string;
  precision: 'exact' | 'facility' | 'city' | 'region' | 'chokepoint';
  evidence: EvidenceRef[];
}

export interface OpsRecordBase {
  id: string;
  observedAt: string;
  sourceUri: string;
  sourceType: SourceType;
  entities: string[];
  relations: RelationRef[];
  confidence: number;
  supportingEvidence: EvidenceRef[];
  contradictingEvidence: EvidenceRef[];
  falsifier: string;
  actionState: ActionState;
  /** ID/hash/pointer into the tamper-evident Nexus ledger. */
  ledgerRef: string | null;
  geo?: GeoRef;
}

export interface RealityDelta extends OpsRecordBase {
  kind: 'reality-delta';
  title: string;
  summary: string;
  /** Why this differs materially from the prior world-model state. */
  delta: string;
  firstOrderImpacts: string[];
  secondOrderImpacts: string[];
}

export interface OpportunityScoreBreakdown {
  expectedValue: number;
  speedToSignal: number;
  feasibility: number;
  durability: number;
  competitivePosition: number;
  capabilityFit: number;
  reversibility: number;
  total: number;
  veto: string | null;
}

export interface OpportunityRecord extends OpsRecordBase {
  kind: 'opportunity';
  title: string;
  thesis: string;
  whyNow: string;
  score: OpportunityScoreBreakdown;
  recommendedNextAction: string;
  evidenceRequiredToAdvance: string[];
}

export interface OperationRecord extends OpsRecordBase {
  kind: 'operation';
  actor: 'nova' | 'argus' | 'hoot' | 'nexus' | 'codex' | 'alex' | string;
  objective: string;
  authorityLevel: 'read-only' | 'bounded-internal' | 'human-required';
  currentBottleneck: string;
  resultSummary?: string;
}

export interface AlternativeDataTrial extends OpsRecordBase {
  kind: 'alternative-data-trial';
  hypothesis: string;
  baselineSource: EvidenceRef;
  alternativeDataSource: EvidenceRef;
  incrementalValueMetric: string;
  baselineValue?: number;
  alternativeDataValue?: number;
  resolvedOutcome?: string;
  killCondition: string;
}

export interface OperationsDisplaySnapshot {
  generatedAt: string;
  realityDelta: RealityDelta[];
  /** Hard cap: the display is a prioritization surface, not an alert firehose. */
  opportunityRadar: OpportunityRecord[];
  orbitalInsight: Array<RealityDelta | OpportunityRecord>;
  operations: OperationRecord[];
  alphaHunter: AlternativeDataTrial[];
}

export function validateSnapshot(snapshot: OperationsDisplaySnapshot): string[] {
  const errors: string[] = [];
  if (snapshot.opportunityRadar.length > 5) {
    errors.push('opportunityRadar must contain at most 5 ranked opportunities');
  }
  for (const item of snapshot.orbitalInsight) {
    if (!item.geo) errors.push(`orbitalInsight item ${item.id} lacks verified geo evidence`);
  }
  const all: OpsRecordBase[] = [
    ...snapshot.realityDelta,
    ...snapshot.opportunityRadar,
    ...snapshot.orbitalInsight,
    ...snapshot.operations,
    ...snapshot.alphaHunter,
  ];
  for (const item of all) {
    if (!item.sourceUri) errors.push(`${item.id}: sourceUri is required`);
    if (item.confidence < 0 || item.confidence > 1) errors.push(`${item.id}: confidence must be in [0,1]`);
    if (!item.falsifier.trim()) errors.push(`${item.id}: falsifier is required`);
    if (item.actionState !== 'DETECTED' && item.ledgerRef === null) {
      errors.push(`${item.id}: non-DETECTED states require a ledgerRef`);
    }
  }
  return errors;
}
