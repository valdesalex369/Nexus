import type { Claim, Source } from '../discovery/types.ts';
import type { ActionProposal, Ruling } from '../policy/index.ts';
import type { ScoredOpportunity } from '../wayfinder/index.ts';

export type RadarMode = 'LIVE' | 'FIXTURE';
export type RadarActionStatus = 'VERIFIED' | 'HUMAN_GATE' | 'DENIED';

export interface FederalRegisterAgency {
  name: string;
  raw_name?: string;
  id?: number;
  url?: string;
}

export interface FederalRegisterDocument {
  title: string;
  type: string;
  abstract: string | null;
  document_number: string;
  html_url: string;
  pdf_url: string | null;
  public_inspection_pdf_url?: string | null;
  publication_date: string;
  agencies: FederalRegisterAgency[];
  excerpts?: string | null;
  comments_close_on?: string | null;
}

export interface FederalRegisterEnvelope {
  description: string;
  count: number;
  results: FederalRegisterDocument[];
}

export interface SourceEvent {
  mode: RadarMode;
  endpoint: string;
  retrievedAt: string;
  rawSha256: string;
  source: Source;
  document: FederalRegisterDocument;
  entities: string[];
  whatChanged: string;
  sourceCaveat: string;
}

export interface BusReference {
  url: string;
  sha256?: string;
  relation: 'source' | 'official-edition' | 'supports' | 'challenges';
}

export interface BusMessage {
  schemaVersion: 'nexus.bus.v1';
  id: string;
  sender: string;
  recipients: string[];
  timestamp: string;
  kind: 'source.event' | 'deliberation' | 'response';
  payload: unknown;
  references: BusReference[];
  requestedCapabilities?: string[];
  requestedCapitalLevel?: number;
}

export interface IngestedBusEvent {
  message: BusMessage;
  trust: 'UNTRUSTED_EXTERNAL';
  authorityWideningDenied: false;
}

export interface RadarUncertainty {
  id: string;
  claimId: string;
  kind: 'OUTCOME_UNKNOWN' | 'ECONOMIC_VALUE_UNVALIDATED' | 'SINGLE_SOURCE';
  statement: string;
  severity: number;
  evidenceRefs: string[];
}

export interface DeliberationPosition {
  role: 'ARGUS' | 'NOVA';
  position: 'PURSUE_BOUNDED_RESEARCH' | 'CHALLENGE_CONFIDENCE';
  claimClass: 'HYPOTHESIS';
  statement: string;
  evidenceRefs: string[];
  confidence: number;
}

export interface Deliberation {
  thesis: DeliberationPosition;
  crossExamination: DeliberationPosition;
  resolution: 'DISAGREEMENT_RETAINED';
  unresolved: string[];
}

export interface ScenarioAssumptions {
  label: 'EXPERIMENT_PRIOR_NOT_FORECAST';
  valueUsd: number;
  probability: number;
  startupCostUsd: number;
  basis: string[];
}

export interface ActionOutcome {
  proposal: ActionProposal;
  ruling: Ruling;
  status: RadarActionStatus;
  evidence: { artifactPath?: string; artifactSha256?: string; reason: string };
}

export interface RadarSnapshot {
  schemaVersion: 'nexus.opportunity-radar.v0';
  runId: string;
  generatedAt: string;
  dataMode: RadarMode;
  live: boolean;
  realityDelta: {
    status: 'BASELINE' | 'NEW_DOCUMENT' | 'UNCHANGED';
    previousDocumentNumber: string | null;
    statement: string;
  };
  sourceEvent: SourceEvent;
  claims: Claim[];
  uncertainties: RadarUncertainty[];
  opportunities: ScoredOpportunity[];
  scenarioAssumptions: ScenarioAssumptions;
  deliberation: Deliberation;
  action: ActionOutcome;
  ledger: {
    verified: boolean;
    length: number;
    headHash: string;
    events: Array<{
      id: number;
      kind: string;
      actor: string;
      task?: string;
      evidence: unknown;
      hash: string;
    }>;
  };
}
