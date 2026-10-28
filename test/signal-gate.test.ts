import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSignal, type SignalGateInput } from '../src/radar/signal-gate.ts';

const baseline: SignalGateInput = {
  asOf: '2026-10-28T19:57:00.000Z', mode: 'LIVE', delta: 'NEW_DOCUMENT',
  sourceId: 'federal-register-001', sourceUrl: 'https://www.federalregister.gov/documents/123',
  sourceSha256: 'a'.repeat(64), publishedOn: '2026-10-27',
  observedClaimProvenances: [['federal-register-001']], independentSourceIds: [],
  validatedBuyerEvidenceRefs: [], unknownClaims: 2, opportunityScore: 0.85,
  opportunityVeto: false, economicsAreExperimental: true,
};

describe('NEXUS signal promotion gate', () => {
  test('current single-source experimental research cannot be promoted', () => {
    const result = evaluateSignal(baseline);
    assert.equal(result.decision, 'RESEARCH_ONLY');
    assert.deepEqual(result.reasons, ['SINGLE_SOURCE', 'UNVALIDATED_ECONOMICS', 'OPEN_UNCERTAINTY']);
    assert.equal(result.externalActionAllowed, false);
  });
  test('unchanged event is suppressed, never recycled as new alpha', () => {
    const result = evaluateSignal({ ...baseline, delta: 'UNCHANGED' });
    assert.equal(result.decision, 'SUPPRESS');
    assert.ok(result.reasons.includes('UNCHANGED_EVENT'));
  });
  test('stale or future-dated source is suppressed', () => {
    assert.ok(evaluateSignal({ ...baseline, publishedOn: '2026-09-01' }).reasons.includes('STALE_SOURCE'));
    assert.ok(evaluateSignal({ ...baseline, publishedOn: '2026-10-29' }).reasons.includes('FUTURE_PUBLICATION_DATE'));
  });
  test('invalid evidence and invalid dates fail closed', () => {
    const result = evaluateSignal({ ...baseline, sourceSha256: 'not-a-hash', observedClaimProvenances: [[]], publishedOn: '2026-02-30' });
    assert.equal(result.decision, 'SUPPRESS');
    assert.ok(result.reasons.includes('INVALID_SOURCE_EVIDENCE'));
    assert.ok(result.reasons.includes('INVALID_PUBLICATION_DATE'));
  });
  test('fixture never escapes research-only status even with commercial evidence', () => {
    const result = evaluateSignal({ ...baseline, mode: 'FIXTURE', independentSourceIds: ['independent-2'],
      validatedBuyerEvidenceRefs: ['customer-contract-1'], unknownClaims: 0, economicsAreExperimental: false });
    assert.equal(result.decision, 'RESEARCH_ONLY');
    assert.ok(result.reasons.includes('FIXTURE_NOT_LIVE'));
  });
  test('high-score corroborated commercial event can only request human review', () => {
    const result = evaluateSignal({ ...baseline, independentSourceIds: ['independent-2'],
      validatedBuyerEvidenceRefs: ['customer-contract-1'], unknownClaims: 0, economicsAreExperimental: false });
    assert.equal(result.decision, 'HUMAN_REVIEW');
    assert.deepEqual(result.reasons, []);
    assert.equal(result.externalActionAllowed, false);
  });
  test('score or veto blocks promotion even with two sources', () => {
    const candidate = { ...baseline, independentSourceIds: ['independent-2'],
      validatedBuyerEvidenceRefs: ['customer-contract-1'], unknownClaims: 0, economicsAreExperimental: false };
    assert.ok(evaluateSignal({ ...candidate, opportunityScore: 0.2 }).reasons.includes('LOW_SCORE'));
    assert.ok(evaluateSignal({ ...candidate, opportunityVeto: true }).reasons.includes('OPPORTUNITY_VETO'));
  });
  test('rejects unsafe configuration rather than weakening a threshold', () => {
    assert.throws(() => evaluateSignal({ ...baseline, maxAgeDays: -1 }), /maxAgeDays/);
    assert.throws(() => evaluateSignal({ ...baseline, promotionThreshold: -1 }), /promotionThreshold/);
  });
});
