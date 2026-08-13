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

  test('every score decomposes into named, disputable components', () => {
    const s = score(base());
    const names = s.components.map((c) => c.name);
    for (const required of ['expected_value', 'speed_to_signal', 'feasibility',
      'durability', 'competitive_position', 'capability_fit', 'reversibility']) {
      assert.ok(names.includes(required), `missing component ${required}`);
    }
    for (const c of s.components) {
      assert.ok(c.rationale.length > 0, `${c.name} has no rationale`);
    }
  });

  test('vetoes a severe, irreversible downside regardless of upside', () => {
    const s = score(base({
      valueUsd: 100_000_000, probability: 0.99, startupCostUsd: 1,
      downsideSeverity: 0.9, reversibility: 0.1,
    }));
    assert.ok(s.veto, 'must be vetoed');
    assert.equal(s.score, 0);
    assert.match(s.veto!, /cannot undo/);
  });

  test('a vetoed opportunity always ranks below every viable one', () => {
    const ranked = rank([
      base({ id: 'ruin', title: 'huge but unrecoverable',
        valueUsd: 1e9, probability: 0.99, downsideSeverity: 0.95, reversibility: 0.05 }),
      base({ id: 'modest', title: 'modest and safe',
        valueUsd: 2_000, probability: 0.4 }),
    ]);
    assert.equal(ranked[0]!.opportunity.id, 'modest');
    assert.equal(ranked[1]!.opportunity.id, 'ruin');
    assert.ok(ranked[1]!.veto);
  });

  test('novelty contributes nothing — identical inputs score identically', () => {
    const a = score(base({ id: 'a', title: 'boring proven thing' }));
    const b = score(base({ id: 'b', title: 'exciting novel breakthrough AI web4 thing' }));
    assert.equal(a.score, b.score);
  });

  test('faster time to signal outranks a slower identical opportunity', () => {
    const fast = score(base({ daysToFirstSignal: 2 }));
    const slow = score(base({ daysToFirstSignal: 90 }));
    assert.ok(fast.score > slow.score);
  });

  test('distribution difficulty is weighted above technical difficulty', () => {
    const hardBuild = score(base({ technicalDifficulty: 0.9, distributionDifficulty: 0.1 }));
    const hardSell = score(base({ technicalDifficulty: 0.1, distributionDifficulty: 0.9 }));
    assert.ok(hardSell.score < hardBuild.score,
      'a thing that is hard to sell should score below a thing that is hard to build');
  });

  test('cost-adjusted expected value beats raw upside', () => {
    const cheap = score(base({ valueUsd: 10_000, startupCostUsd: 100 }));
    const pricey = score(base({ valueUsd: 12_000, startupCostUsd: 50_000 }));
    assert.ok(cheap.score > pricey.score);
  });

  test('zero probability or zero value is vetoed', () => {
    assert.ok(score(base({ probability: 0 })).veto);
    assert.ok(score(base({ valueUsd: 0 })).veto);
  });

  test('ranking is stable and explanation renders every component', () => {
    const ranked = rank([base({ id: 'a' }), base({ id: 'b', probability: 0.9 })]);
    assert.equal(ranked[0]!.rank, 1);
    assert.equal(ranked[0]!.opportunity.id, 'b');
    const text = explain(ranked);
    assert.match(text, /expected_value/);
    assert.match(text, /#1/);
  });
});
