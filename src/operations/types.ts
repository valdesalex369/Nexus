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
  | 'registry-mirror'
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

/**
 * Null means "not yet defensibly scored", never zero. This is deliberate:
 * unknown economics must remain unknown until Wayfinder has evidence.
 */
export interface OpportunityScoreBreakdown {
  expectedValue: number | null;
  speedToSignal: number | null;
  feasibility: number | null;
  durability: number | null;
  competitivePosition: number | null;
  capabilityFit: number | null;
  reversibility: number | null;
  total: number | null;
  veto: string | null;
  /** Distinguishes evidence-backed commercial EV from research-learning priority. */
  scoreType?: 'commercial_ev' | 'research_learning' | 'none';
  status?: 'SCORED' | 'RESEARCH_PRIORITY' | 'INSUFFICIENT_EVIDENCE' | 'VETOED';
  gate?: string | null;
  components?: Array<{ name: string; value: number; rationale: string }>;
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

export type OperationsDataMode = 'LIVE' | 'FIXTURE' | 'STATIC';

export interface EvidenceGraphSource {
  id: string;
  uri: string;
  provider: string;
  title: string;
  sha256: string;
  reliability: number;
  flags: string[];
  officialEditionUri?: string;
  caveat?: string;
}

export interface EvidenceGraphClaim {
  id: string;
  text: string;
  classification: 'OBSERVED' | 'INFERRED' | 'HYPOTHESIS' | 'UNKNOWN';
  subject?: string;
  predicate?: string;
  value?: string | number;
  provenance: string[];
  confidence: number;
  createdAt: string;
}

export interface EvidenceGraphContradiction {
  claimA: string;
  claimB: string;
  reason: string;
  severity: number;
  kind: 'value-conflict' | 'identity-ambiguity';
}

export interface EvidenceGraphUncertainty {
  id: string;
  kind: 'OUTCOME_UNKNOWN' | 'ECONOMIC_VALUE_UNVALIDATED' | 'SINGLE_SOURCE';
  statement: string;
  evidenceRefs: string[];
}

export interface OperationsEvidenceGraph {
  rawArtifact: { id: string; sha256: string };
  sources: EvidenceGraphSource[];
  claims: EvidenceGraphClaim[];
  contradictions: EvidenceGraphContradiction[];
  uncertainties: EvidenceGraphUncertainty[];
}

export interface OperationsVerification {
  schemaVersion: 'nexus.operations-verification.v0';
  runId: string;
  dataMode: OperationsDataMode;
  sourceDocumentNumber: string;
  sourceSha256: string;
  sourceDocumentSha256: string;
  deltaStatus: 'BASELINE' | 'NEW_DOCUMENT' | 'UPDATED_DOCUMENT' | 'UNCHANGED';
  /** Ledger event that commits the semantic snapshot digest. */
  ledgerEventId: number;
  ledgerHead: string;
  /** Ledger length immediately after ledgerEventId was appended. Later runs may extend it. */
  ledgerLength: number;
  /** Digest of the canonical snapshot content, excluding circular ledger binding fields. */
  contentSha256: string;
  verifiedAt: string;
}

export interface OperationsDisplaySnapshot {
  generatedAt: string;
  /** Present only on runtime-produced state. Static fixture compilation omits it. */
  verification?: OperationsVerification;
  evidenceGraph?: OperationsEvidenceGraph;
  realityDelta: RealityDelta[];
  /** Hard cap: the display is a prioritization surface, not an alert firehose. */
  opportunityRadar: OpportunityRecord[];
  orbitalInsight: Array<RealityDelta | OpportunityRecord>;
  operations: OperationRecord[];
  alphaHunter: AlternativeDataTrial[];
}

export function validateSnapshot(snapshot: OperationsDisplaySnapshot): string[] {
  const errors: string[] = [];
  const generatedAtMs = Date.parse(snapshot.generatedAt);
  if (!Number.isFinite(generatedAtMs)) {
    errors.push('generatedAt must be a valid ISO timestamp');
  }
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
  const temporalChecked = new Set<string>();
  for (const item of all) {
    if (!item.sourceUri) errors.push(`${item.id}: sourceUri is required`);
    if (item.confidence < 0 || item.confidence > 1) errors.push(`${item.id}: confidence must be in [0,1]`);
    if (!item.falsifier.trim()) errors.push(`${item.id}: falsifier is required`);
    if (item.actionState !== 'DETECTED' && item.ledgerRef === null) {
      errors.push(`${item.id}: non-DETECTED states require a ledgerRef`);
    }
    if (!temporalChecked.has(item.id)) {
      temporalChecked.add(item.id);
      const observedAtMs = Date.parse(item.observedAt);
      if (!Number.isFinite(observedAtMs)) {
        errors.push(`${item.id}: observedAt must be a valid ISO timestamp`);
      } else if (Number.isFinite(generatedAtMs) && observedAtMs > generatedAtMs) {
        errors.push(`${item.id}: observedAt cannot be later than snapshot generatedAt`);
      }
    }
  }
  if ((snapshot.verification === undefined) !== (snapshot.evidenceGraph === undefined)) {
    errors.push('verification and evidenceGraph must either both be present or both be absent');
  }
  if (snapshot.verification && snapshot.evidenceGraph) {
    const verification = snapshot.verification;
    if (!verification.runId.trim()) errors.push('verification.runId is required');
    if (!/^[a-f0-9]{64}$/.test(verification.sourceSha256)) {
      errors.push('verification.sourceSha256 must be a SHA-256 digest');
    }
    if (!/^[a-f0-9]{64}$/.test(verification.sourceDocumentSha256)) {
      errors.push('verification.sourceDocumentSha256 must be a SHA-256 digest');
    }
    if (!/^[a-f0-9]{64}$/.test(verification.ledgerHead)) {
      errors.push('verification.ledgerHead must be a SHA-256 digest');
    }
    if (!Number.isInteger(verification.ledgerEventId) || verification.ledgerEventId < 1) {
      errors.push('verification.ledgerEventId must be a positive integer');
    }
    if (!Number.isInteger(verification.ledgerLength) || verification.ledgerLength < 1) {
      errors.push('verification.ledgerLength must be a positive integer');
    }
    if (!/^[a-f0-9]{64}$/.test(verification.contentSha256)) {
      errors.push('verification.contentSha256 must be a SHA-256 digest');
    }
    if (!Number.isFinite(Date.parse(verification.verifiedAt))) {
      errors.push('verification.verifiedAt must be a valid ISO timestamp');
    }
    for (const item of all) {
      if (item.ledgerRef !== verification.ledgerHead) {
        errors.push(`${item.id}: runtime records must reference verification.ledgerHead`);
      }
    }
    if (snapshot.evidenceGraph.rawArtifact.sha256 !== verification.sourceSha256) {
      errors.push('evidenceGraph raw artifact must match verification.sourceSha256');
    }
    const sourceIds = new Set(snapshot.evidenceGraph.sources.map((source) => source.id));
    const claimIds = new Set(snapshot.evidenceGraph.claims.map((claim) => claim.id));
    for (const claim of snapshot.evidenceGraph.claims) {
      if (claim.confidence < 0 || claim.confidence > 1) {
        errors.push(`${claim.id}: evidenceGraph confidence must be in [0,1]`);
      }
      const known = claim.classification === 'INFERRED' ? new Set([...sourceIds, ...claimIds]) : sourceIds;
      for (const ref of claim.provenance) {
        if (!known.has(ref)) errors.push(`${claim.id}: provenance ref ${ref} is absent from evidenceGraph`);
      }
    }
    for (const source of snapshot.evidenceGraph.sources) {
      if (!/^[a-f0-9]{64}$/.test(source.sha256)) {
        errors.push(`${source.id}: evidenceGraph source sha256 is invalid`);
      }
      if (source.reliability < 0 || source.reliability > 1) {
        errors.push(`${source.id}: evidenceGraph source reliability must be in [0,1]`);
      }
    }
    for (const contradiction of snapshot.evidenceGraph.contradictions) {
      if (!claimIds.has(contradiction.claimA) || !claimIds.has(contradiction.claimB)) {
        errors.push('evidenceGraph contradiction references an absent claim');
      }
    }
    for (const uncertainty of snapshot.evidenceGraph.uncertainties) {
      if (uncertainty.evidenceRefs.some((ref) => !claimIds.has(ref))) {
        errors.push(`${uncertainty.id}: uncertainty references an absent claim`);
      }
    }
  }
  return errors;
}
