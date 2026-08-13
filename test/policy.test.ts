import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Policy, configFromEnv, DEFAULT_CONFIG, type CapitalLevel } from '../src/policy/index.ts';

const at = (level: CapitalLevel, extra: Partial<typeof DEFAULT_CONFIG> = {}) =>
  new Policy({
    ...DEFAULT_CONFIG, capitalLevel: level,
    maxTransactionUsd: { 0: 0, 1: 0, 2: 0, 3: 100, 4: 1000, 5: 10000 }[level],
    ...extra,
  });

describe('policy', () => {
  test('allows allowlisted reversible work', () => {
    const r = at(0).rule({
      capability: 'net.fetch', actor: 'wayfinder',
      blastRadius: 'external', summary: 'read a public page',
    });
    assert.equal(r.decision, 'allow');
  });

  test('denies hard-forbidden capabilities at every level', () => {
    for (const level of [0, 1, 2, 3, 4, 5] as CapitalLevel[]) {
      for (const cap of ['credentials.exfiltrate', 'policy.selfmodify', 'ledger.rewrite']) {
        const r = at(level).rule({
          capability: cap, actor: 'rogue', blastRadius: 'none', summary: 'x',
        });
        assert.equal(r.decision, 'deny', `${cap} must be denied at level ${level}`);
      }
    }
  });

  test('denies moving funds below capital level 3', () => {
    for (const level of [0, 1, 2] as CapitalLevel[]) {
      const r = at(level).rule({
        capability: 'trade.execute', actor: 'alphabot',
        blastRadius: 'financial', amountUsd: 10, summary: 'buy',
      });
      assert.equal(r.decision, 'deny', `level ${level} must not move funds`);
    }
  });

  test('level 2 is explicitly simulation-only', () => {
    const r = at(2).rule({
      capability: 'trade.execute', actor: 'alphabot',
      blastRadius: 'financial', amountUsd: 5, summary: 'buy',
    });
    assert.equal(r.decision, 'deny');
    assert.match(r.reason, /simulation only/);
  });

  test('requires approval for permitted transactions, never auto-allows', () => {
    const r = at(3).rule({
      capability: 'trade.execute', actor: 'alphabot',
      blastRadius: 'financial', amountUsd: 50, summary: 'buy',
    });
    assert.equal(r.decision, 'require_approval');
  });

  test('denies transactions above the level ceiling', () => {
    const r = at(3).rule({
      capability: 'trade.execute', actor: 'alphabot',
      blastRadius: 'financial', amountUsd: 101, summary: 'too big',
    });
    assert.equal(r.decision, 'deny');
    assert.match(r.reason, /exceeds/);
  });

  test('destructive and published actions always need approval', () => {
    for (const radius of ['destructive', 'published'] as const) {
      const r = at(5).rule({
        capability: 'fs.write.workspace', actor: 'claude',
        blastRadius: radius, summary: 'risky',
      });
      assert.equal(r.decision, 'require_approval', `${radius} must escalate`);
    }
  });

  test('escalates rather than assuming on unknown capabilities', () => {
    const r = at(0).rule({
      capability: 'some.new.tool', actor: 'x', blastRadius: 'local', summary: 'unknown',
    });
    assert.equal(r.decision, 'require_approval');
  });

  test('capital level cannot be raised at runtime', () => {
    const p = at(0);
    // There is no setter by construction; confirm the accessor is read-only.
    assert.equal(p.capitalLevel, 0);
    assert.throws(() => {
      (p as unknown as { capitalLevel: number }).capitalLevel = 5;
    });
    assert.equal(p.capitalLevel, 0);
  });

  test('env parsing clamps invalid capital levels to 0', () => {
    for (const bad of ['9', '-1', 'five', '2.5', '']) {
      assert.equal(configFromEnv({ NEXUS_CAPITAL_LEVEL: bad }).capitalLevel, 0, `input: ${bad}`);
    }
    assert.equal(configFromEnv({ NEXUS_CAPITAL_LEVEL: '3' }).capitalLevel, 3);
  });

  test('run budget ceiling is enforced', () => {
    const p = at(0, { maxRunUsd: 0.5 });
    assert.equal(p.withinRunBudget(0.4), true);
    assert.equal(p.withinRunBudget(0.5), false);
    assert.equal(p.withinRunBudget(0.9), false);
  });
});
