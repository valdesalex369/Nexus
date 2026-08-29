import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type AlphaPrediction,
  resolveAlphaPrediction,
  summarizeAlphaCalibration,
  validateAlphaPrediction,
} from '../src/operations/alpha-ledger.ts';

function prediction(overrides: Partial<AlphaPrediction> = {}): AlphaPrediction {
  return {
    id: 'alpha-1',
    createdAt: '2026-08-29T14:00:00Z',
    horizonEnd: '2026-09-05T14:00:00Z',
    thesis: 'SOL outperforms BTC over the next seven days.',
    target: 'SOL/BTC 7d relative return > 0',
    probability: 0.72,
    baselineProbability: 0.5,
    decision: 'PAPER_LONG',
    paperNotionalUsd: 500,
    evidence: [
      {
        uri: 'https://example.com/primary',
        sourceType: 'primary',
      },
    ],
    contradictingEvidence: [],
    falsifier: 'SOL/BTC relative return is <= 0 by horizon end.',
    sourceContributions: [{ id: 'primary-flow', role: 'flow evidence' }],
    modelContributions: [{ id: 'nova', role: 'synthesis' }],
    status: 'OPEN',
    ...overrides,
  };
}

test('validates a falsifiable open alpha prediction', () => {
  assert.deepEqual(validateAlphaPrediction(prediction()), []);
});

test('rejects invalid probability and missing evidence', () => {
  const errors = validateAlphaPrediction(prediction({ probability: 1.2, evidence: [] }));
  assert.ok(errors.includes('probability must be in [0,1]'));
  assert.ok(errors.includes('at least one evidence reference is required'));
});

test('resolves prediction with Brier score and paper PnL', () => {
  const resolved = resolveAlphaPrediction(
    prediction(),
    true,
    '2026-09-05T14:00:00Z',
    'SOL outperformed BTC over the stated horizon.',
    8,
  );
  assert.equal(resolved.status, 'RESOLVED');
  assert.equal(resolved.resolution.brierScore, (0.72 - 1) ** 2);
  assert.equal(resolved.resolution.paperPnlUsd, 40);
});

test('summarizes calibration without hiding misses', () => {
  const hit = resolveAlphaPrediction(prediction({ id: 'hit', probability: 0.8 }), true, '2026-09-05T14:00:00Z', 'hit');
  const miss = resolveAlphaPrediction(prediction({ id: 'miss', probability: 0.8 }), false, '2026-09-05T14:00:00Z', 'miss');
  const summary = summarizeAlphaCalibration([hit, miss]);
  assert.equal(summary.count, 2);
  assert.equal(summary.highConfidenceCount, 2);
  assert.equal(summary.highConfidenceHitRate, 0.5);
  assert.equal(summary.observedOutcomeRate, 0.5);
  assert.ok(summary.meanBrierScore !== null && summary.meanBrierScore > 0);
});

test('refuses impossible temporal resolution', () => {
  assert.throws(
    () => resolveAlphaPrediction(prediction(), true, '2026-08-28T14:00:00Z', 'impossible'),
    /resolvedAt cannot be earlier than createdAt/,
  );
});
