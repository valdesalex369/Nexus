import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type AlternativeDataTrial,
  type OperationRecord,
  type OperationsDisplaySnapshot,
  type OpportunityRecord,
  type RealityDelta,
  validateSnapshot,
} from './types.ts';

type RawRealityDelta = RealityDelta & {
  alphaHunter?: {
    hypothesis: string;
    baseline: string;
    alternativeData: string;
    incrementalValueMetric: string;
    killCondition: string;
  };
};

type EventRecord = RawRealityDelta | OpportunityRecord;

const ROOT = process.cwd();
const EVENTS_DIR = path.join(ROOT, 'data', 'operations', 'events');
const SNAPSHOT_PATH = path.join(ROOT, 'data', 'operations', 'current.json');

function byNewest<T extends { observedAt: string }>(a: T, b: T): number {
  return Date.parse(b.observedAt) - Date.parse(a.observedAt);
}

function toAlphaTrial(item: RawRealityDelta): AlternativeDataTrial | null {
  if (!item.alphaHunter || !item.geo) return null;
  const evidence = item.supportingEvidence[0] ?? { uri: item.sourceUri, observedAt: item.observedAt };
  return {
    kind: 'alternative-data-trial',
    id: `alpha-${item.id}`,
    observedAt: item.observedAt,
    sourceUri: item.sourceUri,
    sourceType: 'alternative-data',
    entities: item.entities,
    relations: item.relations,
    confidence: item.confidence,
    supportingEvidence: item.supportingEvidence,
    contradictingEvidence: item.contradictingEvidence,
    falsifier: item.falsifier,
    actionState: 'DETECTED',
    ledgerRef: null,
    geo: item.geo,
    hypothesis: item.alphaHunter.hypothesis,
    baselineSource: {
      uri: item.sourceUri,
      title: item.alphaHunter.baseline,
      observedAt: item.observedAt,
      note: 'Baseline description from the source-backed event fixture.',
    },
    alternativeDataSource: {
      ...evidence,
      title: item.alphaHunter.alternativeData,
      note: 'Candidate alternative-data layer. DETECTED only until direct data access and held-out evaluation exist.',
    },
    incrementalValueMetric: item.alphaHunter.incrementalValueMetric,
    killCondition: item.alphaHunter.killCondition,
  };
}

async function readEvents(): Promise<EventRecord[]> {
  const names = (await readdir(EVENTS_DIR)).filter((name) => name.endsWith('.json')).sort();
  const events: EventRecord[] = [];
  for (const name of names) {
    const raw = await readFile(path.join(EVENTS_DIR, name), 'utf8');
    const parsed = JSON.parse(raw) as EventRecord;
    if (parsed.kind !== 'reality-delta' && parsed.kind !== 'opportunity') {
      throw new Error(`${name}: unsupported event kind`);
    }
    events.push(parsed);
  }
  return events.sort(byNewest);
}

async function readExistingOperations(): Promise<OperationRecord[]> {
  try {
    const raw = await readFile(SNAPSHOT_PATH, 'utf8');
    const snapshot = JSON.parse(raw) as Partial<OperationsDisplaySnapshot>;
    return Array.isArray(snapshot.operations) ? snapshot.operations : [];
  } catch {
    return [];
  }
}

export async function compileOperationsSnapshot(now = new Date()): Promise<OperationsDisplaySnapshot> {
  const events = await readEvents();
  const reality = events.filter((event): event is RawRealityDelta => event.kind === 'reality-delta');
  const opportunities = events.filter((event): event is OpportunityRecord => event.kind === 'opportunity');
  const alpha = reality.map(toAlphaTrial).filter((trial): trial is AlternativeDataTrial => trial !== null);

  const snapshot: OperationsDisplaySnapshot = {
    generatedAt: now.toISOString(),
    realityDelta: reality.slice(0, 10),
    opportunityRadar: opportunities.slice(0, 5),
    orbitalInsight: reality.filter((event) => Boolean(event.geo)).slice(0, 10),
    operations: await readExistingOperations(),
    alphaHunter: alpha.slice(0, 5),
  };

  const errors = validateSnapshot(snapshot);
  if (errors.length > 0) {
    throw new Error(`Operations snapshot validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }
  return snapshot;
}

async function main(): Promise<void> {
  const snapshot = await compileOperationsSnapshot();
  await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  process.stdout.write(`wrote ${SNAPSHOT_PATH} from ${snapshot.realityDelta.length + snapshot.opportunityRadar.length} event fixture(s)\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
