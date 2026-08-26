import assert from 'node:assert/strict';
import test from 'node:test';
import { type OperationsDisplaySnapshot, type RealityDelta, validateSnapshot } from '../src/operations/types.ts';

function realityDelta(observedAt: string): RealityDelta {
  return {
    kind: 'reality-delta',
    id: 'test-event',
    observedAt,
    sourceUri: 'https://example.com/source',
    sourceType: 'primary',
    entities: ['example'],
    relations: [],
    confidence: 0.9,
    supportingEvidence: [],
    contradictingEvidence: [],
    falsifier: 'A later observation disproves the claim.',
    actionState: 'DETECTED',
    ledgerRef: null,
    title: 'Test event',
    summary: 'Fixture for temporal validation.',
    delta: 'No-op test delta.',
    firstOrderImpacts: [],
    secondOrderImpacts: [],
  };
}

function snapshot(event: RealityDelta, generatedAt: string): OperationsDisplaySnapshot {
  return {
    generatedAt,
    realityDelta: [event],
    opportunityRadar: [],
    orbitalInsight: [],
    operations: [],
    alphaHunter: [],
  };
}

test('accepts events observed at or before snapshot generation', () => {
  const errors = validateSnapshot(snapshot(realityDelta('2026-08-26T11:05:45Z'), '2026-08-26T11:06:08Z'));
  assert.deepEqual(errors, []);
});

test('rejects future-dated events in a generated snapshot', () => {
  const errors = validateSnapshot(snapshot(realityDelta('2026-08-26T11:08:00Z'), '2026-08-26T11:06:08Z'));
  assert.ok(errors.some((error) => error.includes('observedAt cannot be later than snapshot generatedAt')));
});

test('rejects invalid snapshot timestamps', () => {
  const errors = validateSnapshot(snapshot(realityDelta('2026-08-26T11:05:45Z'), 'not-a-date'));
  assert.ok(errors.includes('generatedAt must be a valid ISO timestamp'));
});
