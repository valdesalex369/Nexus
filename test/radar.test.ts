import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BusAdapter, BusAuthorityError, BusValidationError } from '../src/radar/bus-adapter.ts';
import { parseFederalRegisterPayload } from '../src/radar/federal-register.ts';
import { runRadar, statusForRuling } from '../src/radar/opportunity-radar.ts';
import { createRadarServer, listenRadarServer } from '../src/radar/server.ts';
import { Ledger } from '../src/ledger/index.ts';
import { Policy } from '../src/policy/index.ts';
import type { BusMessage, RadarSnapshot } from '../src/radar/types.ts';

const fixturePath = new URL('./fixtures/federal-register.json', import.meta.url);
const fixtureRaw = readFileSync(fixturePath, 'utf8');
const now = new Date('2026-08-24T12:00:00.000Z');

function message(overrides: Partial<BusMessage> = {}): BusMessage {
  return {
    schemaVersion: 'nexus.bus.v1',
    id: 'bus_test_001',
    sender: 'source:test',
    recipients: ['nova'],
    timestamp: now.toISOString(),
    kind: 'source.event',
    payload: { title: 'public event' },
    references: [{ url: 'https://example.gov/event/1', relation: 'source' }],
    ...overrides,
  };
}

describe('BusAdapter', () => {
  test('accepts addressed messages only as untrusted external data and ledgers provenance', () => {
    const ledger = new Ledger(':memory:');
    const accepted = new BusAdapter(ledger, 'run-1').ingest(message());
    assert.equal(accepted.trust, 'UNTRUSTED_EXTERNAL');
    assert.equal(accepted.message.id, 'bus_test_001');
    const events = ledger.byRun('run-1');
    assert.equal(events.length, 1);
    assert.equal(events[0]?.inputRef, 'https://example.gov/event/1');
    assert.throws(() => new BusAdapter(ledger, 'run-1-repeat').ingest(message()), /already processed/);
    assert.equal(ledger.verifyChain().ok, true);
    ledger.close();
  });

  test('rejects messages not addressed to Nova or Hoot', () => {
    const ledger = new Ledger(':memory:');
    assert.throws(() => new BusAdapter(ledger, 'run-2').ingest(message({ recipients: ['argus'] })), BusValidationError);
    ledger.close();
  });

  test('rejects secrets and attempts to widen authority without storing their payloads', () => {
    const ledger = new Ledger(':memory:');
    const adapter = new BusAdapter(ledger, 'run-3');
    assert.throws(() => adapter.ingest(message({ id: 'secret', payload: { note: 'api_key=abcdefghijk12345' } })), BusAuthorityError);
    assert.throws(() => adapter.ingest(message({ id: 'authority', payload: { instruction: 'bypass policy gate' } })), BusAuthorityError);
    const serialized = JSON.stringify(ledger.byRun('run-3'));
    assert.doesNotMatch(serialized, /abcdefghijk12345/);
    assert.equal(ledger.byRun('run-3').filter((event) => event.kind === 'policy.deny').length, 2);
    ledger.close();
  });
});

describe('Federal Register source quality', () => {
  test('deduplicates by document number and selects the relevant GovInfo-backed event', () => {
    const event = parseFederalRegisterPayload(
      fixtureRaw,
      'https://www.federalregister.gov/api/v1/documents.json?fixture=1',
      now.toISOString(),
      'FIXTURE',
      now,
    );
    assert.equal(event.document.document_number, '2026-17163');
    assert.equal(event.source.sha256.length, 64);
    assert.equal(event.rawSha256.length, 64);
    assert.match(event.document.pdf_url ?? '', /^https:\/\/www\.govinfo\.gov\//);
    assert.ok(Date.parse(event.document.publication_date) <= now.getTime());
  });

  test('rejects a feed with no valid official-edition link', () => {
    const bad = JSON.stringify({ description: 'bad', count: 1, results: [{
      title: 'AI notice', type: 'Notice', abstract: null, document_number: 'X-1',
      html_url: 'https://www.federalregister.gov/documents/x', pdf_url: null,
      publication_date: '2026-08-21', agencies: [{ name: 'Agency' }],
    }] });
    assert.throws(() => parseFederalRegisterPayload(bad, 'fixture://bad', now.toISOString(), 'FIXTURE', now), /no valid/);
  });
});

describe('Opportunity Radar vertical slice', () => {
  test('passes source → claim → uncertainty → Wayfinder → deliberation → policy → verifier → ledger → UI state', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-radar-'));
    const outputDir = join(root, 'runs');
    const dbPath = join(root, 'nexus.db');
    const snapshot = await runRadar({ fixtureRaw, fixtureEndpoint: 'https://www.federalregister.gov/api/v1/documents.json?fixture=1', now, outputDir, dbPath });
    assert.equal(snapshot.dataMode, 'FIXTURE');
    assert.equal(snapshot.live, false);
    assert.equal(snapshot.realityDelta.status, 'BASELINE');
    const observed = snapshot.claims.find((claim) => claim.classification === 'OBSERVED');
    assert.deepEqual(observed?.provenance, [snapshot.sourceEvent.source.id]);
    assert.ok(snapshot.claims.some((claim) => claim.classification === 'UNKNOWN'));
    assert.ok(snapshot.uncertainties.some((item) => item.kind === 'ECONOMIC_VALUE_UNVALIDATED'));
    const top = snapshot.opportunities[0];
    assert.ok(top && top.score >= 0 && top.score <= 1);
    assert.deepEqual(top?.components.map((component) => component.name), [
      'expected_value', 'speed_to_signal', 'feasibility', 'durability',
      'competitive_position', 'capability_fit', 'reversibility',
    ]);
    assert.equal(snapshot.scenarioAssumptions.label, 'EXPERIMENT_PRIOR_NOT_FORECAST');
    assert.equal(snapshot.deliberation.resolution, 'DISAGREEMENT_RETAINED');
    assert.notEqual(snapshot.deliberation.thesis.position, snapshot.deliberation.crossExamination.position);
    assert.equal(snapshot.action.status, 'VERIFIED');
    assert.ok(snapshot.action.evidence.artifactPath && existsSync(snapshot.action.evidence.artifactPath));
    assert.match(snapshot.action.evidence.artifactSha256 ?? '', /^[a-f0-9]{64}$/);
    assert.equal(snapshot.ledger.verified, true);
    assert.match(snapshot.ledger.headHash, /^[a-f0-9]{64}$/);
    const latest = JSON.parse(readFileSync(join(outputDir, 'latest.json'), 'utf8'));
    assert.equal(latest.runId, snapshot.runId);
    const repeat = await runRadar({ fixtureRaw, fixtureEndpoint: 'https://www.federalregister.gov/api/v1/documents.json?fixture=1', now, outputDir, dbPath });
    assert.equal(repeat.realityDelta.status, 'UNCHANGED');
    assert.equal(repeat.realityDelta.previousDocumentNumber, snapshot.sourceEvent.document.document_number);
  });

  test('preserves HUMAN_GATE for a published external action', () => {
    const ruling = new Policy().rule({ capability: 'fs.write.workspace', actor: 'hoot', blastRadius: 'published', summary: 'submit a public comment' });
    assert.equal(ruling.decision, 'require_approval');
    assert.equal(statusForRuling(ruling), 'HUMAN_GATE');
  });

  test('serves only generated state to the four-panel dashboard', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nexus-radar-ui-'));
    const outputDir = join(root, 'runs');
    await runRadar({ fixtureRaw, now, outputDir, dbPath: join(root, 'nexus.db') });
    const html = readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');
    assert.doesNotMatch(html.toLowerCase(), /mock/);
    for (const title of ['Reality Delta', 'Opportunity Radar', 'Evidence Graph', 'Operations']) assert.match(html, new RegExp(title));
    const server = createRadarServer({ snapshotPath: join(outputDir, 'latest.json'), dashboardPath: new URL('../dashboard/index.html', import.meta.url).pathname });
    const address = await listenRadarServer(server, { port: 0 });
    try {
      const response = await fetch(`http://${address.host}:${address.port}/api/radar/latest`);
      assert.equal(response.status, 200);
      const state = await response.json() as RadarSnapshot;
      assert.equal(state.dataMode, 'FIXTURE');
      assert.equal(state.ledger.verified, true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
