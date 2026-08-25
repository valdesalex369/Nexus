import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateClaim, type Claim } from '../discovery/types.ts';
import { Ledger } from '../ledger/index.ts';
import { Policy, type ActionProposal, type Ruling } from '../policy/index.ts';
import { rank, type Opportunity } from '../wayfinder/index.ts';
import { BusAdapter } from './bus-adapter.ts';
import { fetchFederalRegisterEvent, parseFederalRegisterPayload } from './federal-register.ts';
import type {
  ActionOutcome, BusMessage, Deliberation, DeliberationPosition, RadarActionStatus,
  RadarMode, RadarSnapshot, RadarUncertainty, ScenarioAssumptions, SourceEvent,
} from './types.ts';

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${digest(value).slice(0, 16)}`;
}

function buildClaims(event: SourceEvent, createdAt: string): Claim[] {
  const observed: Claim = {
    id: stableId('claim', `${event.source.id}|published`),
    text: event.whatChanged,
    classification: 'OBSERVED',
    subject: event.document.document_number,
    predicate: 'published',
    value: event.document.title,
    provenance: [event.source.id],
    confidence: event.source.reliability,
    createdAt,
  };
  const outcomeUnknown: Claim = {
    id: stableId('claim', `${event.source.id}|outcome-unknown`),
    text: `The final outcome, timing, and implementation of ${event.document.document_number} are not established by publication alone.`,
    classification: 'UNKNOWN',
    subject: event.document.document_number,
    predicate: 'final_outcome',
    value: 'unknown',
    provenance: [event.source.id],
    confidence: 0.2,
    createdAt,
  };
  const economicUnknown: Claim = {
    id: stableId('claim', `${event.source.id}|economic-value-unknown`),
    text: 'Publication does not prove buyer demand, revenue, or a monetizable opportunity for Nexus.',
    classification: 'UNKNOWN',
    subject: event.document.document_number,
    predicate: 'economic_value',
    value: 'unvalidated',
    provenance: [event.source.id],
    confidence: 0.1,
    createdAt,
  };
  const claims = [observed, outcomeUnknown, economicUnknown];
  const sourceIds = new Set([event.source.id]);
  const claimIds = new Set(claims.map((claim) => claim.id));
  for (const claim of claims) validateClaim(claim, sourceIds, claimIds);
  return claims;
}

function buildUncertainties(claims: Claim[]): RadarUncertainty[] {
  const observed = claims.find((claim) => claim.classification === 'OBSERVED')!;
  const outcome = claims.find((claim) => claim.predicate === 'final_outcome')!;
  const economic = claims.find((claim) => claim.predicate === 'economic_value')!;
  return [
    {
      id: stableId('uncertainty', outcome.id), claimId: outcome.id, kind: 'OUTCOME_UNKNOWN',
      statement: outcome.text, severity: 0.7, evidenceRefs: [observed.id, outcome.id],
    },
    {
      id: stableId('uncertainty', economic.id), claimId: economic.id, kind: 'ECONOMIC_VALUE_UNVALIDATED',
      statement: economic.text, severity: 0.85, evidenceRefs: [observed.id, economic.id],
    },
    {
      id: stableId('uncertainty', `${observed.id}|single-source`), claimId: observed.id, kind: 'SINGLE_SOURCE',
      statement: 'The v0 run uses one primary event feed; independent corroboration is not yet present.',
      severity: 0.45, evidenceRefs: [observed.id],
    },
  ];
}

function buildOpportunity(event: SourceEvent): { opportunity: Opportunity; assumptions: ScenarioAssumptions } {
  const assumptions: ScenarioAssumptions = {
    label: 'EXPERIMENT_PRIOR_NOT_FORECAST',
    valueUsd: 300,
    probability: 0.15,
    startupCostUsd: 50,
    basis: [
      '$300 is a bounded pilot-price scenario, not observed revenue or a market forecast.',
      '15% is a conservative discovery prior that must be replaced by outreach evidence.',
      '$50 is a two-hour internal time-cost proxy; the action has no cash outlay or external commitment.',
    ],
  };
  return {
    assumptions,
    opportunity: {
      id: stableId('opp', event.document.document_number),
      title: `Build a source-backed intelligence brief: ${event.document.title}`,
      source: event.source.url ?? event.endpoint,
      valueUsd: assumptions.valueUsd,
      probability: assumptions.probability,
      startupCostUsd: assumptions.startupCostUsd,
      daysToFirstSignal: 1,
      technicalDifficulty: 0.15,
      distributionDifficulty: 0.6,
      grossMargin: 0.85,
      repeatability: 0.65,
      automationPotential: 0.75,
      competitivePressure: 0.65,
      capabilityFit: 0.8,
      reversibility: 0.98,
      downsideSeverity: 0.05,
    },
  };
}

function buildDeliberation(event: SourceEvent, claim: Claim, scoreValue: number, uncertainties: RadarUncertainty[]): Deliberation {
  const thesis: DeliberationPosition = {
    role: 'ARGUS',
    position: 'PURSUE_BOUNDED_RESEARCH',
    claimClass: 'HYPOTHESIS',
    statement: `A one-page brief on “${event.document.title}” is cheap, reversible, and can test whether the policy change creates buyer demand.`,
    evidenceRefs: [claim.id, event.source.id],
    confidence: Math.min(0.5, scoreValue * 0.6),
  };
  const crossExamination: DeliberationPosition = {
    role: 'NOVA',
    position: 'CHALLENGE_CONFIDENCE',
    claimClass: 'HYPOTHESIS',
    statement: 'A publication is not demand evidence; the score depends on explicit scenario priors and must not be described as forecast revenue.',
    evidenceRefs: [claim.id, ...uncertainties.map((item) => item.id)],
    confidence: 0.5,
  };
  return {
    thesis,
    crossExamination,
    resolution: 'DISAGREEMENT_RETAINED',
    unresolved: uncertainties.map((item) => item.statement),
  };
}

export function statusForRuling(ruling: Ruling, verified = false): RadarActionStatus {
  if (ruling.decision === 'deny') return 'DENIED';
  if (ruling.decision === 'require_approval') return 'HUMAN_GATE';
  if (!verified) throw new Error('an allowed action cannot be labeled VERIFIED without read-back evidence');
  return 'VERIFIED';
}

export interface RunRadarOptions {
  outputDir?: string;
  dbPath?: string;
  term?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
  fixtureRaw?: string;
  fixtureEndpoint?: string;
  policy?: Policy;
  actionProposal?: ActionProposal;
}

export async function runRadar(options: RunRadarOptions = {}): Promise<RadarSnapshot> {
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const outputDir = options.outputDir ?? './data/runs';
  const dbPath = options.dbPath ?? './data/nexus.db';
  const policy = options.policy ?? new Policy();
  const ledger = new Ledger(dbPath);
  const runId = Ledger.newRunId();
  mkdirSync(outputDir, { recursive: true });
  let previousDocumentNumber: string | null = null;
  try {
    const previous = JSON.parse(readFileSync(join(outputDir, 'latest.json'), 'utf8')) as Partial<RadarSnapshot>;
    previousDocumentNumber = previous.sourceEvent?.document.document_number ?? null;
  } catch { /* first run establishes the baseline */ }

  try {
    ledger.append({
      runId, kind: 'run.start', actor: 'opportunity-radar',
      task: 'one live source-to-verified-action vertical slice',
      payload: { mode: options.fixtureRaw === undefined ? 'LIVE' : 'FIXTURE' },
    });

    const fetchRuling = policy.rule({
      capability: 'net.fetch', actor: 'opportunity-radar', blastRadius: 'external',
      summary: 'read the public Federal Register API', reversible: true,
    });
    ledger.append({
      runId, kind: 'decision', actor: 'nexus.policy', task: 'gate public source fetch',
      payload: fetchRuling,
    });
    if (fetchRuling.decision !== 'allow') throw new Error(`source fetch blocked by policy: ${fetchRuling.reason}`);

    let sourceEvent: SourceEvent;
    if (options.fixtureRaw !== undefined) {
      sourceEvent = parseFederalRegisterPayload(
        options.fixtureRaw,
        options.fixtureEndpoint ?? 'fixture://federal-register',
        generatedAt,
        'FIXTURE',
        now,
      );
    } else {
      sourceEvent = await fetchFederalRegisterEvent({ term: options.term, fetchImpl: options.fetchImpl, now });
    }
    const deltaStatus = previousDocumentNumber === null
      ? 'BASELINE' as const
      : previousDocumentNumber === sourceEvent.document.document_number
        ? 'UNCHANGED' as const
        : 'NEW_DOCUMENT' as const;
    const realityDelta = {
      status: deltaStatus,
      previousDocumentNumber,
      statement: deltaStatus === 'BASELINE'
        ? 'First verified run: this event establishes the comparison baseline.'
        : deltaStatus === 'UNCHANGED'
          ? `No newer selected document than ${sourceEvent.document.document_number} was found in this query.`
          : `Selected document changed from ${previousDocumentNumber} to ${sourceEvent.document.document_number}.`,
    };

    ledger.append({
      runId, kind: 'discovery', actor: 'source:federal-register',
      task: 'retrieve one current AI/government/infrastructure event',
      inputRef: sourceEvent.endpoint,
      payload: {
        documentNumber: sourceEvent.document.document_number,
        publicationDate: sourceEvent.document.publication_date,
        mode: sourceEvent.mode,
        deltaStatus: realityDelta.status,
      },
      evidence: {
        rawSha256: sourceEvent.rawSha256,
        sourceSha256: sourceEvent.source.sha256,
        sourceUrl: sourceEvent.source.url,
        officialPdfUrl: sourceEvent.document.pdf_url,
        caveat: sourceEvent.sourceCaveat,
      },
      confidence: sourceEvent.source.reliability,
    });

    const busMessage: BusMessage = {
      schemaVersion: 'nexus.bus.v1',
      id: stableId('bus', `${runId}|${sourceEvent.document.document_number}`),
      sender: 'source:federal-register',
      recipients: ['nova', 'hoot'],
      timestamp: sourceEvent.retrievedAt,
      kind: 'source.event',
      payload: {
        documentNumber: sourceEvent.document.document_number,
        title: sourceEvent.document.title,
        publicationDate: sourceEvent.document.publication_date,
      },
      references: [
        { url: sourceEvent.source.url!, sha256: sourceEvent.source.sha256, relation: 'source' },
        { url: sourceEvent.document.pdf_url!, relation: 'official-edition' },
      ],
    };
    const busEvent = new BusAdapter(ledger, runId).ingest(busMessage);

    const claims = buildClaims(sourceEvent, generatedAt);
    const uncertainties = buildUncertainties(claims);
    ledger.append({
      runId, kind: 'discovery', actor: 'ultra-instinct:claim-normalizer',
      task: 'normalize event into provenance-bound claims',
      inputRef: busEvent.message.id,
      payload: {
        observed: claims.filter((claim) => claim.classification === 'OBSERVED').length,
        unknown: claims.filter((claim) => claim.classification === 'UNKNOWN').length,
        uncertainties: uncertainties.length,
      },
      evidence: claims.map((claim) => ({ id: claim.id, class: claim.classification, provenance: claim.provenance })),
    });

    const { opportunity, assumptions } = buildOpportunity(sourceEvent);
    const opportunities = rank([opportunity]);
    const top = opportunities[0]!;
    ledger.append({
      runId, kind: 'decision', actor: 'wayfinder', task: 'rank bounded research opportunity',
      payload: { opportunityId: opportunity.id, rank: top.rank, score: top.score, veto: top.veto },
      evidence: { components: top.components, assumptions },
    });

    const observedClaim = claims.find((claim) => claim.classification === 'OBSERVED')!;
    const deliberation = buildDeliberation(sourceEvent, observedClaim, top.score, uncertainties);
    ledger.append({
      runId, kind: 'decision', actor: 'argus', task: 'independent opportunity thesis',
      payload: deliberation.thesis, evidence: { refs: deliberation.thesis.evidenceRefs },
    });
    ledger.append({
      runId, kind: 'evaluation', actor: 'nova', task: 'cross-examine opportunity thesis',
      payload: deliberation.crossExamination,
      evidence: { refs: deliberation.crossExamination.evidenceRefs, resolution: deliberation.resolution },
    });

    const proposal = options.actionProposal ?? {
      capability: 'fs.write.workspace',
      actor: 'hoot',
      blastRadius: 'local',
      summary: 'write a source-backed internal brief and dashboard state',
      reversible: true,
      costUsd: 0,
    };
    const ruling = policy.rule(proposal);
    ledger.append({
      runId, kind: ruling.decision === 'deny' ? 'policy.deny' : 'decision',
      actor: 'nexus.policy', task: 'gate recommended action',
      payload: { proposal, ruling },
    });

    let action: ActionOutcome;
    if (ruling.decision === 'allow') {
      const artifactPath = join(outputDir, `${runId}.brief.json`);
      const brief = {
        schemaVersion: 'nexus.opportunity-brief.v0', runId, generatedAt,
        source: sourceEvent, claims, uncertainties, opportunity: top,
        assumptions, deliberation,
      };
      const encoded = `${JSON.stringify(brief, null, 2)}\n`;
      ledger.append({
        runId, kind: 'action', actor: proposal.actor, task: proposal.summary,
        tools: ['fs.write.workspace'], inputRef: sourceEvent.source.url,
        payload: { artifactPath },
      });
      writeFileSync(artifactPath, encoded, 'utf8');
      const readBack = readFileSync(artifactPath, 'utf8');
      if (readBack !== encoded) throw new Error('brief artifact failed exact read-back verification');
      const artifactSha256 = digest(readBack);
      action = {
        proposal, ruling, status: statusForRuling(ruling, true),
        evidence: { artifactPath, artifactSha256, reason: 'exact bytes read back and SHA-256 recorded' },
      };
      ledger.append({
        runId, kind: 'result', actor: 'nexus.verifier', task: 'verify bounded action',
        payload: { status: action.status }, evidence: action.evidence,
      });
    } else {
      action = {
        proposal, ruling, status: statusForRuling(ruling),
        evidence: { reason: ruling.reason },
      };
      ledger.append({
        runId, kind: ruling.decision === 'require_approval' ? 'escalation' : 'result',
        actor: 'nexus.verifier', task: 'stop bounded action at policy gate',
        payload: { status: action.status }, evidence: action.evidence,
      });
    }

    ledger.append({
      runId, kind: 'run.end', actor: 'opportunity-radar',
      task: 'complete source-to-action vertical slice',
      payload: {
        sourceDocument: sourceEvent.document.document_number,
        claims: claims.length,
        uncertainties: uncertainties.length,
        opportunities: opportunities.length,
        actionStatus: action.status,
      },
      evidence: { sourceSha256: sourceEvent.source.sha256, action: action.evidence },
    });

    const verification = ledger.verifyChain();
    if (!verification.ok) throw new Error(`ledger verification failed at event ${verification.brokenAtId}`);
    const events = ledger.byRun(runId);
    const snapshot: RadarSnapshot = {
      schemaVersion: 'nexus.opportunity-radar.v0',
      runId,
      generatedAt,
      dataMode: sourceEvent.mode,
      live: sourceEvent.mode === 'LIVE',
      realityDelta,
      sourceEvent,
      claims,
      uncertainties,
      opportunities,
      scenarioAssumptions: assumptions,
      deliberation,
      action,
      ledger: {
        verified: true,
        length: verification.length,
        headHash: events.at(-1)!.hash,
        events: events.map((event) => ({
          id: event.id, kind: event.kind, actor: event.actor, task: event.task,
          evidence: event.evidence, hash: event.hash,
        })),
      },
    };
    const latestPath = join(outputDir, 'latest.json');
    writeFileSync(latestPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    const latest = JSON.parse(readFileSync(latestPath, 'utf8')) as RadarSnapshot;
    if (latest.runId !== runId || latest.ledger.headHash !== snapshot.ledger.headHash) {
      throw new Error('dashboard snapshot failed read-back verification');
    }
    return snapshot;
  } catch (error) {
    try {
      ledger.append({ runId, kind: 'error', actor: 'opportunity-radar', task: 'vertical slice failed', error: (error as Error).message });
      ledger.append({ runId, kind: 'run.end', actor: 'opportunity-radar', task: 'failed', payload: { status: 'FAIL' } });
    } catch { /* preserve the original failure */ }
    throw error;
  } finally {
    ledger.close();
  }
}
