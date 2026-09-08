import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { detectContradictions } from '../discovery/claims.ts';
import { validateClaim, type Claim, type Contradiction, type Source } from '../discovery/types.ts';
import { KnowledgeStore } from '../knowledge/store.ts';
import { Ledger } from '../ledger/index.ts';
import { Policy, type ActionProposal, type Ruling } from '../policy/index.ts';
import { rank, type ScoredOpportunity } from '../wayfinder/index.ts';
import {
  fetchFederalRegister,
  parseFederalRegisterPayload,
  type FederalRegisterRead,
  type FederalRegisterSourceEvent,
} from './federal-register.ts';
import { confinedPath } from './path-boundary.ts';
import {
  type EvidenceGraphClaim,
  type EvidenceGraphSource,
  type EvidenceGraphUncertainty,
  type OperationRecord,
  type OperationsDisplaySnapshot,
  type OpportunityRecord,
  type OpportunityScoreBreakdown,
  type RealityDelta,
  validateSnapshot,
} from './types.ts';
import {
  operationsContentSha256,
  verifyOperationsSnapshot,
  ZERO_SHA256,
} from './verification.ts';

const INTERNAL_BRIEF_PROPOSAL: ActionProposal = {
  capability: 'fs.write.workspace',
  actor: 'hoot',
  blastRadius: 'local',
  summary: 'write one reversible, source-backed internal evidence brief',
  reversible: true,
};

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${digest(value).slice(0, 16)}`;
}

function buildClaims(event: FederalRegisterSourceEvent): Claim[] {
  const common = `${event.source.id}|${event.document.document_number}`;
  const claims: Claim[] = [
    {
      id: stableId('claim', `${common}|published-title|${event.document.title}`),
      text: event.whatChanged,
      classification: 'OBSERVED',
      subject: event.document.document_number,
      predicate: 'published-title',
      value: event.document.title,
      provenance: [event.source.id],
      confidence: event.source.reliability,
      createdAt: event.retrievedAt,
    },
    {
      id: stableId('claim', `${common}|outcome-unknown`),
      text: `The final outcome, timing, and implementation of ${event.document.document_number} are not established by publication alone.`,
      classification: 'UNKNOWN',
      subject: event.document.document_number,
      predicate: 'final-outcome',
      value: 'unknown',
      provenance: [event.source.id],
      confidence: 0,
      createdAt: event.retrievedAt,
    },
    {
      id: stableId('claim', `${common}|economics-unknown`),
      text: 'This publication does not establish buyer demand, revenue, conversion probability, or delivery cost for Nexus.',
      classification: 'UNKNOWN',
      subject: event.document.document_number,
      predicate: 'commercial-economics',
      value: 'unvalidated',
      provenance: [event.source.id],
      confidence: 0,
      createdAt: event.retrievedAt,
    },
  ];
  const sourceIds = new Set([event.source.id]);
  const claimIds = new Set(claims.map((claim) => claim.id));
  for (const claim of claims) validateClaim(claim, sourceIds, claimIds);
  return claims;
}

function buildUncertainties(claims: Claim[], providerCount: number): EvidenceGraphUncertainty[] {
  const outcome = claims.find((claim) => claim.predicate === 'final-outcome')!;
  const economics = claims.find((claim) => claim.predicate === 'commercial-economics')!;
  const uncertainties: EvidenceGraphUncertainty[] = [
    {
      id: stableId('uncertainty', outcome.id),
      kind: 'OUTCOME_UNKNOWN',
      statement: outcome.text,
      evidenceRefs: [outcome.id],
    },
    {
      id: stableId('uncertainty', economics.id),
      kind: 'ECONOMIC_VALUE_UNVALIDATED',
      statement: economics.text,
      evidenceRefs: [economics.id],
    },
  ];
  if (providerCount < 2) {
    const observed = claims.find((claim) => claim.classification === 'OBSERVED')!;
    uncertainties.push({
      id: stableId('uncertainty', `${observed.id}|single-source`),
      kind: 'SINGLE_SOURCE',
      statement: 'Only one independent provider supports this event; corroboration is not yet present.',
      evidenceRefs: [observed.id],
    });
  }
  return uncertainties;
}

function scoreBreakdown(scored: ScoredOpportunity): OpportunityScoreBreakdown {
  const component = (name: string) => scored.components.find((item) => item.name === name)?.value ?? null;
  const total = scored.status === 'INSUFFICIENT_EVIDENCE' ? null : scored.score;
  return {
    expectedValue: component('expected_value'),
    speedToSignal: component('speed_to_signal'),
    feasibility: component('feasibility'),
    durability: component('durability'),
    competitivePosition: component('competitive_position'),
    capabilityFit: component('capability_fit'),
    reversibility: component('reversibility'),
    total,
    veto: scored.veto,
    scoreType: scored.scoreType,
    status: scored.status,
    gate: scored.gate,
    components: scored.components,
  };
}

function actionState(
  ruling: Ruling,
  boundedResultVerified: boolean,
  quarantined: boolean,
): OperationRecord['actionState'] {
  if (quarantined) return 'INVESTIGATING';
  if (ruling.decision === 'require_approval') return 'HUMAN_GATE';
  if (ruling.decision === 'deny') return 'FAILED';
  return boundedResultVerified ? 'VERIFIED' : 'FAILED';
}

function isSupportedBriefProposal(proposal: ActionProposal): boolean {
  return proposal.capability === INTERNAL_BRIEF_PROPOSAL.capability
    && proposal.actor === INTERNAL_BRIEF_PROPOSAL.actor
    && proposal.blastRadius === INTERNAL_BRIEF_PROPOSAL.blastRadius
    && proposal.summary === INTERNAL_BRIEF_PROPOSAL.summary
    && proposal.reversible === INTERNAL_BRIEF_PROPOSAL.reversible
    && (proposal.amountUsd ?? 0) === 0
    && (proposal.costUsd ?? 0) === 0;
}

function readPriorSnapshot(snapshotPath: string, ledger: Ledger): OperationsDisplaySnapshot | null {
  if (!existsSync(snapshotPath)) return null;
  try {
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as OperationsDisplaySnapshot;
    return verifyOperationsSnapshot(snapshot, ledger).length === 0 ? snapshot : null;
  } catch {
    return null;
  }
}

function toEvidenceSource(source: Source): EvidenceGraphSource {
  return {
    id: source.id,
    uri: source.url ?? source.path ?? `nexus://sources/${source.id}`,
    provider: source.provider,
    title: source.title ?? source.id,
    sha256: source.sha256,
    reliability: source.reliability,
    flags: source.flags,
  };
}

function deltaState(previous: OperationsDisplaySnapshot | null, event: FederalRegisterSourceEvent): {
  status: 'BASELINE' | 'NEW_DOCUMENT' | 'UPDATED_DOCUMENT' | 'UNCHANGED';
  statement: string;
} {
  const prior = previous?.verification?.sourceDocumentNumber;
  if (!prior) return { status: 'BASELINE', statement: 'First verified runtime cycle establishes the comparison baseline.' };
  if (prior === event.document.document_number) {
    if (previous.verification?.sourceDocumentSha256 !== event.documentSha256) {
      return { status: 'UPDATED_DOCUMENT', statement: `Selected document ${prior} retained its identifier but its structured content changed.` };
    }
    return { status: 'UNCHANGED', statement: `No newer selected document than ${prior} was found for this query.` };
  }
  return { status: 'NEW_DOCUMENT', statement: `Selected document changed from ${prior} to ${event.document.document_number}.` };
}

export interface RunLiveOperationsOptions {
  runtimeRoot?: string;
  snapshotPath?: string;
  ledgerPath?: string;
  knowledgeDbPath?: string;
  blobDir?: string;
  briefDir?: string;
  term?: string;
  now?: Date;
  fixtureRaw?: string;
  fixtureEndpoint?: string;
  policy?: Policy;
  actionProposal?: ActionProposal;
}

export interface LiveOperationsResult {
  snapshot: OperationsDisplaySnapshot;
  briefPath: string | null;
}

export async function runLiveOperations(options: RunLiveOperationsOptions = {}): Promise<LiveOperationsResult> {
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const runtimeRoot = resolve(options.runtimeRoot ?? process.env.NEXUS_RUNTIME_ROOT ?? process.cwd());
  const snapshotPath = confinedPath(runtimeRoot,
    options.snapshotPath ?? join(runtimeRoot, 'data', 'operations', 'current.json'), 'snapshotPath');
  const ledgerPath = confinedPath(runtimeRoot,
    options.ledgerPath ?? process.env.NEXUS_DB ?? join(runtimeRoot, 'data', 'nexus.db'), 'ledgerPath');
  const knowledgeDbPath = confinedPath(runtimeRoot,
    options.knowledgeDbPath ?? process.env.NEXUS_KNOWLEDGE_DB ?? join(runtimeRoot, 'data', 'knowledge.db'), 'knowledgeDbPath');
  const blobDir = confinedPath(runtimeRoot,
    options.blobDir ?? process.env.NEXUS_BLOB_DIR ?? join(runtimeRoot, 'data', 'raw'), 'blobDir');
  const briefDir = confinedPath(runtimeRoot,
    options.briefDir ?? process.env.NEXUS_OPERATIONS_BRIEF_DIR ?? join(runtimeRoot, 'data', 'operations', 'briefs'), 'briefDir');
  const policy = options.policy ?? new Policy();
  const ledger = new Ledger(ledgerPath);
  const knowledge = new KnowledgeStore(knowledgeDbPath, blobDir);
  const runId = Ledger.newRunId();
  const previous = readPriorSnapshot(snapshotPath, ledger);

  try {
    ledger.append({
      runId,
      kind: 'run.start',
      actor: 'operations-live-loop',
      task: 'one public-source-to-Operations cycle',
      payload: { mode: options.fixtureRaw === undefined ? 'LIVE' : 'FIXTURE' },
    });

    const sourceProposal: ActionProposal = options.fixtureRaw === undefined
      ? { capability: 'net.fetch', actor: 'operations-live-loop', blastRadius: 'external', summary: 'read the public Federal Register API', reversible: true }
      : { capability: 'fs.read', actor: 'operations-live-loop', blastRadius: 'none', summary: 'replay a local Federal Register fixture', reversible: true };
    const sourceRuling = policy.rule(sourceProposal);
    ledger.append({
      runId,
      kind: sourceRuling.decision === 'deny' ? 'policy.deny' : 'decision',
      actor: 'nexus.policy',
      task: 'gate public source read',
      payload: { proposal: sourceProposal, ruling: sourceRuling },
    });
    if (sourceRuling.decision !== 'allow') throw new Error(`source read blocked by policy: ${sourceRuling.reason}`);

    let read: FederalRegisterRead;
    if (options.fixtureRaw !== undefined) {
      read = {
        raw: options.fixtureRaw,
        event: parseFederalRegisterPayload(
          options.fixtureRaw,
          options.fixtureEndpoint ?? 'fixture://federal-register',
          generatedAt,
          'FIXTURE',
          now,
        ),
      };
    } else {
      read = await fetchFederalRegister({ term: options.term, now });
    }
    const event = read.event;
    const quarantined = event.source.flags.length > 0;
    const delta = deltaState(previous, event);
    const rawArtifact = knowledge.putRaw(read.raw, 'federal-register-api-response', 'Direct read from FederalRegister.gov');
    knowledge.putSource(event.source);
    ledger.append({
      runId,
      kind: 'discovery',
      actor: 'source:federal-register',
      task: 'retrieve and retain one official public event feed',
      inputRef: event.endpoint,
      payload: {
        documentNumber: event.document.document_number,
        publicationDate: event.document.publication_date,
        mode: event.mode,
        deltaStatus: delta.status,
        flags: event.source.flags,
      },
      evidence: {
        rawArtifactId: rawArtifact.id,
        rawSha256: rawArtifact.sha256,
        documentSha256: event.documentSha256,
        sourceUrl: event.source.url,
        govInfoPdfUri: event.document.pdf_url,
        govInfoFetched: false,
        caveat: event.sourceCaveat,
      },
      confidence: event.source.reliability,
    });

    const claims = buildClaims(event);
    for (const claim of claims) knowledge.putClaim(claim, runId);
    const allClaims = [...new Map(knowledge.recall(event.document.document_number, 200)
      .filter((claim) => claim.subject === event.document.document_number)
      .map((claim) => [claim.id, claim])).values()];
    const sourceIds = [...new Set(allClaims.flatMap((claim) => claim.provenance))];
    const sourceGraph = knowledge.sources(sourceIds).map(toEvidenceSource);
    const currentSource: EvidenceGraphSource = {
      ...toEvidenceSource(event.source),
      officialEditionUri: event.document.pdf_url,
      caveat: event.sourceCaveat,
    };
    const sources = [...new Map([...sourceGraph, currentSource].map((source) => [source.id, source])).values()];
    const providers = new Map(sources.map((source) => [source.id, source.provider]));
    const contradictions = detectContradictions(allClaims, (sourceId) => providers.get(sourceId));
    for (const contradiction of contradictions) knowledge.putContradiction(contradiction, runId);
    const uncertainties = buildUncertainties(claims, new Set(sources.map((source) => source.provider)).size);
    ledger.append({
      runId,
      kind: 'discovery',
      actor: 'nexus.claim-normalizer',
      task: 'normalize claims and preserve contradictions',
      inputRef: event.source.id,
      payload: {
        observed: claims.filter((claim) => claim.classification === 'OBSERVED').length,
        unknown: claims.filter((claim) => claim.classification === 'UNKNOWN').length,
        contradictions: contradictions.length,
        uncertainties: uncertainties.length,
        quarantined,
      },
      evidence: claims.map((claim) => ({ id: claim.id, classification: claim.classification, provenance: claim.provenance })),
    });

    const scored = rank([{
      id: stableId('opp', event.document.document_number),
      title: `Determine whether ${event.document.document_number} warrants a source-backed opportunity brief`,
      source: event.source.url!,
      kind: 'research',
    }])[0]!;
    ledger.append({
      runId,
      kind: 'decision',
      actor: 'wayfinder',
      task: 'apply the evidence gate to the research opportunity',
      payload: {
        opportunityId: scored.opportunity.id,
        status: scored.status,
        score: scored.status === 'INSUFFICIENT_EVIDENCE' ? null : scored.score,
        scoreType: scored.scoreType,
        gate: scored.gate,
      },
      evidence: { components: scored.components, commercialEconomics: null },
    });

    const proposal = options.actionProposal ?? { ...INTERNAL_BRIEF_PROPOSAL };
    const policyRuling = policy.rule(proposal);
    const ruling: Ruling = quarantined
      ? { decision: 'deny', reason: `source quarantined by intake flags: ${event.source.flags.join(', ')}` }
      : policyRuling;
    ledger.append({
      runId,
      kind: ruling.decision === 'deny' ? 'policy.deny' : 'decision',
      actor: 'nexus.policy',
      task: 'gate the bounded next action',
      payload: { proposal, ruling, policyRuling, sourceFlags: event.source.flags },
    });

    if (ruling.decision === 'allow' && !isSupportedBriefProposal(proposal)) {
      ledger.append({
        runId,
        kind: 'policy.deny',
        actor: 'operations-live-loop',
        task: 'reject action without an exact executor binding',
        payload: { proposal, expected: INTERNAL_BRIEF_PROPOSAL },
      });
      throw new Error(`unsupported action proposal '${proposal.capability}': this loop only executes the canonical internal evidence brief`);
    }

    let briefPath: string | null = null;
    let boundedResultVerified = false;
    const verifiedNoChange = ruling.decision === 'allow' && delta.status === 'UNCHANGED';
    if (verifiedNoChange) {
      boundedResultVerified = true;
      ledger.append({
        runId,
        kind: 'result',
        actor: 'nexus.verifier',
        task: 'verify an unchanged source cycle without duplicating the evidence brief',
        payload: { status: 'VERIFIED_NO_CHANGE' },
        evidence: {
          priorRunId: previous?.verification?.runId,
          sourceDocumentSha256: event.documentSha256,
        },
      });
    } else if (ruling.decision === 'allow') {
      mkdirSync(briefDir, { recursive: true });
      briefPath = join(briefDir, `${runId}.json`);
      const brief = {
        schemaVersion: 'nexus.operations-evidence-brief.v0',
        runId,
        generatedAt,
        source: {
          id: event.source.id,
          uri: event.source.url,
          govInfoPdfUri: event.document.pdf_url,
          govInfoFetched: false,
          rawSha256: event.rawSha256,
          reliability: event.source.reliability,
          flags: event.source.flags,
          caveat: event.sourceCaveat,
        },
        claims,
        contradictions,
        uncertainties,
        wayfinder: {
          status: scored.status,
          score: scored.status === 'INSUFFICIENT_EVIDENCE' ? null : scored.score,
          scoreType: scored.scoreType,
          gate: scored.gate,
        },
      };
      const encoded = `${JSON.stringify(brief, null, 2)}\n`;
      ledger.append({
        runId,
        kind: 'action',
        actor: proposal.actor,
        task: proposal.summary,
        tools: [proposal.capability],
        inputRef: event.source.url,
        payload: { artifactPath: briefPath },
      });
      writeFileSync(briefPath, encoded, 'utf8');
      const readBack = readFileSync(briefPath, 'utf8');
      if (readBack !== encoded) throw new Error('internal brief failed exact read-back verification');
      boundedResultVerified = true;
      ledger.append({
        runId,
        kind: 'result',
        actor: 'nexus.verifier',
        task: 'verify the bounded internal brief',
        payload: { status: 'VERIFIED' },
        evidence: { artifactPath: briefPath, artifactSha256: digest(readBack) },
      });
    } else {
      ledger.append({
        runId,
        kind: ruling.decision === 'require_approval' ? 'escalation' : 'result',
        actor: 'nexus.verifier',
        task: 'stop at the policy or source-trust gate without creating an action artifact',
        payload: {
          status: quarantined ? 'QUARANTINED' : ruling.decision === 'require_approval' ? 'HUMAN_GATE' : 'DENIED',
        },
        evidence: { reason: ruling.reason, sourceFlags: event.source.flags },
      });
    }

    const snapshotWriteProposal: ActionProposal = {
      capability: 'fs.write.workspace',
      actor: 'operations-live-loop',
      blastRadius: 'local',
      summary: 'atomically publish the canonical local Operations snapshot',
      reversible: true,
    };
    const snapshotWriteRuling = policy.rule(snapshotWriteProposal);
    ledger.append({
      runId,
      kind: snapshotWriteRuling.decision === 'deny' ? 'policy.deny' : 'decision',
      actor: 'nexus.policy',
      task: 'gate canonical Operations snapshot write',
      payload: { proposal: snapshotWriteProposal, ruling: snapshotWriteRuling },
    });
    if (snapshotWriteRuling.decision !== 'allow') {
      throw new Error(`Operations snapshot write blocked by policy: ${snapshotWriteRuling.reason}`);
    }

    const supportingEvidence = [
      {
        uri: event.source.url!,
        title: event.document.title,
        observedAt: event.retrievedAt,
        note: `Federal Register API payload SHA-256 ${event.rawSha256}`,
      },
      {
        uri: event.document.pdf_url,
        title: 'GovInfo PDF URI supplied by the Federal Register API (not fetched)',
        observedAt: event.retrievedAt,
        note: event.sourceCaveat,
      },
    ];
    const contradictingEvidence = contradictions.map((contradiction: Contradiction) => ({
      uri: `nexus://claims/${contradiction.claimA}/${contradiction.claimB}`,
      title: contradiction.kind,
      observedAt: generatedAt,
      note: contradiction.reason,
    }));
    const relations = event.entities.map((entity) => ({
      from: entity,
      relation: 'published',
      to: event.document.document_number,
      confidence: event.source.reliability,
    }));
    const reality: RealityDelta = {
      kind: 'reality-delta',
      id: stableId('reality', `${runId}|${event.document.document_number}`),
      observedAt: event.retrievedAt,
      sourceUri: event.source.url!,
      sourceType: 'official',
      entities: event.entities,
      relations,
      confidence: event.source.reliability,
      supportingEvidence,
      contradictingEvidence,
      falsifier: 'A later official edition, correction, or agency record supersedes the selected document or changes its material text.',
      actionState: quarantined ? 'INVESTIGATING' : 'VERIFIED',
      ledgerRef: null,
      title: event.document.title,
      summary: event.whatChanged,
      delta: delta.statement,
      firstOrderImpacts: [],
      secondOrderImpacts: [],
    };
    const opportunity: OpportunityRecord = {
      kind: 'opportunity',
      id: scored.opportunity.id,
      observedAt: event.retrievedAt,
      sourceUri: event.source.url!,
      sourceType: 'official',
      entities: event.entities,
      relations,
      confidence: event.source.reliability,
      supportingEvidence,
      contradictingEvidence,
      falsifier: 'Independent evidence shows the event creates no decision-relevant question or the official source is superseded.',
      actionState: quarantined ? 'INVESTIGATING'
        : scored.status === 'INSUFFICIENT_EVIDENCE' ? 'DETECTED' : 'VERIFIED',
      ledgerRef: null,
      title: scored.opportunity.title,
      thesis: 'Treat the publication as a research lead, not as proof of demand or revenue.',
      whyNow: delta.statement,
      score: scoreBreakdown(scored),
      recommendedNextAction: quarantined
        ? 'Human-review the quarantined source fields before using any derived claim or action artifact.'
        : scored.gate
          ? 'Obtain independent corroboration and measured demand/economic evidence before commercial scoring or outreach.'
          : 'Review the evidence brief; any external action still requires Alex approval.',
      evidenceRequiredToAdvance: [
        'independent corroborating source',
        'measured buyer-demand evidence',
        'provenance for any commercial economics',
      ],
    };
    const operationState = actionState(ruling, boundedResultVerified, quarantined);
    const operation: OperationRecord = {
      kind: 'operation',
      id: stableId('operation', runId),
      observedAt: generatedAt,
      sourceUri: event.source.url!,
      sourceType: 'internal',
      entities: ['nexus', 'hoot', ...event.entities],
      relations,
      confidence: event.source.reliability,
      supportingEvidence,
      contradictingEvidence,
      falsifier: 'The ledger chain or committed snapshot digest fails verification, the source payload cannot be reconstructed, or the action artifact differs from its recorded digest.',
      actionState: operationState,
      ledgerRef: null,
      actor: proposal.actor,
      objective: verifiedNoChange
        ? 'verify the source heartbeat without creating another evidence brief when nothing changed'
        : proposal.summary,
      authorityLevel: quarantined || ruling.decision === 'require_approval' ? 'human-required' : 'bounded-internal',
      currentBottleneck: quarantined ? ruling.reason : scored.gate ?? ruling.reason,
      resultSummary: quarantined
        ? `Source was quarantined; no action artifact was created. Flags: ${event.source.flags.join(', ')}.`
        : verifiedNoChange
          ? 'No source delta was found; no duplicate evidence brief or external action was created.'
          : ruling.decision === 'allow'
            ? 'Internal evidence brief was written and read back; no external action occurred.'
            : `No action artifact was created: ${ruling.reason}`,
    };
    const snapshot: OperationsDisplaySnapshot = {
      generatedAt,
      verification: {
        schemaVersion: 'nexus.operations-verification.v0',
        runId,
        dataMode: event.mode,
        sourceDocumentNumber: event.document.document_number,
        sourceSha256: event.rawSha256,
        sourceDocumentSha256: event.documentSha256,
        deltaStatus: delta.status,
        ledgerEventId: 0,
        ledgerHead: ZERO_SHA256,
        ledgerLength: 0,
        contentSha256: ZERO_SHA256,
        verifiedAt: generatedAt,
      },
      evidenceGraph: {
        rawArtifact: { id: rawArtifact.id, sha256: rawArtifact.sha256 },
        sources,
        claims: allClaims as EvidenceGraphClaim[],
        contradictions,
        uncertainties,
      },
      realityDelta: [reality],
      opportunityRadar: [opportunity],
      orbitalInsight: [],
      operations: [operation],
      alphaHunter: [],
    };
    const contentSha256 = operationsContentSha256(snapshot);
    const runEnd = ledger.append({
      runId,
      kind: 'run.end',
      actor: 'operations-live-loop',
      task: 'complete one source-to-Operations cycle',
      payload: {
        documentNumber: event.document.document_number,
        claims: claims.length,
        contradictions: contradictions.length,
        wayfinderStatus: scored.status,
        actionState: operationState,
      },
      evidence: {
        sourceSha256: event.rawSha256,
        briefPath,
        operationsContentSha256: contentSha256,
      },
    });

    const chain = ledger.verifyChain();
    if (!chain.ok) throw new Error(`ledger verification failed at event ${chain.brokenAtId}`);
    snapshot.verification!.ledgerEventId = runEnd.id;
    snapshot.verification!.ledgerHead = runEnd.hash;
    snapshot.verification!.ledgerLength = chain.length;
    snapshot.verification!.contentSha256 = contentSha256;
    for (const record of [reality, opportunity, operation]) record.ledgerRef = runEnd.hash;
    if (operationsContentSha256(snapshot) !== contentSha256) {
      throw new Error('runtime Operations content changed while binding it to the ledger');
    }
    const errors = validateSnapshot(snapshot);
    if (errors.length > 0) throw new Error(`runtime Operations snapshot is invalid: ${errors.join('; ')}`);
    const bindingErrors = verifyOperationsSnapshot(snapshot, ledger);
    if (bindingErrors.length > 0) {
      throw new Error(`runtime Operations ledger binding is invalid: ${bindingErrors.join('; ')}`);
    }

    mkdirSync(dirname(snapshotPath), { recursive: true });
    const encoded = `${JSON.stringify(snapshot, null, 2)}\n`;
    const temporaryPath = `${snapshotPath}.${runId}.tmp`;
    try {
      writeFileSync(temporaryPath, encoded, 'utf8');
      const readBack = JSON.parse(readFileSync(temporaryPath, 'utf8')) as OperationsDisplaySnapshot;
      const readBackErrors = verifyOperationsSnapshot(readBack, ledger);
      if (readBackErrors.length > 0) {
        throw new Error(`canonical Operations snapshot failed read-back verification: ${readBackErrors.join('; ')}`);
      }
      renameSync(temporaryPath, snapshotPath);
    } catch (error) {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
      throw error;
    }
    return { snapshot, briefPath };
  } catch (error) {
    try {
      ledger.append({
        runId,
        kind: 'error',
        actor: 'operations-live-loop',
        task: 'source-to-Operations cycle failed',
        error: (error as Error).message,
      });
      ledger.append({
        runId,
        kind: 'run.end',
        actor: 'operations-live-loop',
        task: 'failed',
        payload: { status: 'FAIL' },
      });
    } catch {
      // Preserve the original failure; a broken ledger is itself the primary failure.
    }
    throw error;
  } finally {
    knowledge.close();
    ledger.close();
  }
}
