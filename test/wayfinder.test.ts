import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { score, rank, explain, type Opportunity } from '../src/wayfinder/index.ts';

const base = (over: Partial<Opportunity> = {}): Opportunity => ({
  id: 'o', title: 'an opportunity', source: 'test',
  valueUsd: 10_000, probability: 0.5,
  startupCostUsd: 500, daysToFirstSignal: 7,
  technicalDifficulty: 0.3, distributionDifficulty: 0.4,
  grossMargin: 0.7, repeatability: 0.6, automationPotential: 0.6,
  competitivePressure: 0.4, capabilityFit: 0.7,
  reversibility: 0.9, downsideSeverity: 0.2,
  ...over,
});

describe('wayfinder', () => {
  test('scores land in [0,1] across extreme inputs', () => {
    const cases = [
      base(), base({ valueUsd: 1e9, startupCostUsd: 1 }),
      base({ valueUsd: 1, startupCostUsd: 1e6 }),
      base({ daysToFirstSignal: 0.1 }), base({ daysToFirstSignal: 3650 }),
    ];
    for (const c of cases) {
      const s = score(c);
      assert.ok(s.score >= 0 && s.score <= 1, `score out of range: ${s.score}`);
    }
  });

  test('every commercial score decomposes into named, disputable components', () => {
    const s = score(base());
    const names = s.components.map((c) => c.name);
    for (const required of ['expected_value', 'speed_to_signal', 'feasibility',
      'durability', 'competitive_position', 'capability_fit', 'reversibility']) {
      assert.ok(names.includes(required), `missing component ${required}`);
    }
    for (const c of s.components) assert.ok(c.rationale.length > 0);
  });

  test('vetoes a severe, irreversible downside regardless of upside', () => {
    const s = score(base({
      valueUsd: 100_000_000, probability: 0.99, startupCostUsd: 1,
      downsideSeverity: 0.9, reversibility: 0.1,
    }));
    assert.equal(s.status, 'VETOED');
    assert.equal(s.score, 0);
    assert.match(s.veto!, /cannot undo/);
  });

  test('a vetoed opportunity always ranks below every viable one', () => {
    const ranked = rank([
      base({ id: 'ruin', title: 'huge but unrecoverable',
        valueUsd: 1e9, probability: 0.99, downsideSeverity: 0.95, reversibility: 0.05 }),
      base({ id: 'modest', title: 'modest and safe', valueUsd: 2_000, probability: 0.4 }),
    ]);
    assert.equal(ranked[0]!.opportunity.id, 'modest');
    assert.equal(ranked[1]!.opportunity.id, 'ruin');
  });

  test('novelty contributes nothing — identical inputs score identically', () => {
    assert.equal(score(base({ title: 'boring proven thing' })).score,
      score(base({ title: 'exciting novel breakthrough AI web4 thing' })).score);
  });

  test('faster time to signal outranks a slower identical opportunity', () => {
    assert.ok(score(base({ daysToFirstSignal: 2 })).score > score(base({ daysToFirstSignal: 90 })).score);
  });

  test('distribution difficulty is weighted above technical difficulty', () => {
    const hardBuild = score(base({ technicalDifficulty: 0.9, distributionDifficulty: 0.1 }));
    const hardSell = score(base({ technicalDifficulty: 0.1, distributionDifficulty: 0.9 }));
    assert.ok(hardSell.score < hardBuild.score);
  });

  test('cost-adjusted expected value beats raw upside', () => {
    assert.ok(score(base({ valueUsd: 10_000, startupCostUsd: 100 })).score
      > score(base({ valueUsd: 12_000, startupCostUsd: 50_000 })).score);
  });

  test('zero probability or zero value is vetoed', () => {
    assert.equal(score(base({ probability: 0 })).status, 'VETOED');
    assert.equal(score(base({ valueUsd: 0 })).status, 'VETOED');
  });

  test('missing commercial economics fails closed instead of fabricating zero', () => {
    const s = score(base({ valueUsd: undefined }));
    assert.equal(s.status, 'INSUFFICIENT_EVIDENCE');
    assert.equal(s.veto, null);
    assert.match(s.gate!, /economics are unknown/);
  });

  test('estimated economics require provenance and rationale', () => {
    const bad = score(base({ economicEvidence: { estimated: true } }));
    assert.equal(bad.status, 'INSUFFICIENT_EVIDENCE');

    const good = score(base({ economicEvidence: {
      estimated: true,
      provenance: 'USASpending award 123',
      rationale: 'median of three comparable awards',
    } }));
    assert.equal(good.status, 'SCORED');
  });

  test('research opportunities never require USD economics', () => {
    const s = score(base({
      kind: 'research',
      valueUsd: undefined, probability: undefined, startupCostUsd: undefined,
      questionValue: 0.9, resolutionProbability: 0.8, evidenceAccess: 0.95,
      daysToFirstSignal: 2,
    }));
    assert.equal(s.status, 'RESEARCH_PRIORITY');
    assert.equal(s.scoreType, 'research_learning');
    assert.ok(s.score > 0);
    assert.ok(!s.components.some((c) => c.name === 'expected_value'));
  });

  test('research opportunities with missing research evidence are gated', () => {
    const s = score(base({
      kind: 'research', valueUsd: undefined, probability: undefined, startupCostUsd: undefined,
    }));
    assert.equal(s.status, 'INSUFFICIENT_EVIDENCE');
  });

  test('ranking is stable and explanation exposes score state', () => {
    const ranked = rank([base({ id: 'a' }), base({ id: 'b', probability: 0.9 })]);
    assert.equal(ranked[0]!.rank, 1);
    assert.equal(ranked[0]!.opportunity.id, 'b');
    const text = explain(ranked);
    assert.match(text, /expected_value/);
    assert.match(text, /SCORED/);
  });
});
