import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateContract, ContractError, type AgentContract } from '../src/agents/contract.ts';
import { AgentRegistry } from '../src/agents/registry.ts';
import { ROSTER, NOVA, CRITIC, KIMI_RESEARCH } from '../src/agents/roster.ts';
import { rootGrant, deriveChild, spend, remaining, permits, isExpired, GrantError }
  from '../src/agents/grant.ts';

const base = (over: Partial<AgentContract> = {}): AgentContract => ({
  id: 'test-agent',
  role: 'a test agent',
  inputs: { description: 'anything', required: [] },
  authorizedTools: ['model.infer', 'fs.read'],
  modelCapabilities: ['engineering.build'],
  maxBlastRadius: 'local',
  output: { kind: 'text', description: 'text' },
  successCriteria: ['it works'],
  failureCriteria: ['it does not'],
  costLimitUsd: 1,
  timeLimitMs: 60_000,
  escalation: { to: 'nova', when: ['stuck'] },
  ledger: { mustRecord: ['action'], requiresObjectiveEvidence: true },
  canSpawn: [],
  maxDepth: 0,
  ...over,
});

describe('agent contracts', () => {
  test('the shipped roster is valid and self-consistent', () => {
    const r = new AgentRegistry();
    r.registerAll(ROSTER);
    assert.equal(r.ids().length, ROSTER.length);
    for (const c of ROSTER) validateContract(c);
  });

  test('requires all ten fields to be meaningfully populated', () => {
    const omissions: [string, Partial<AgentContract>][] = [
      ['role', { role: '' }],
      ['inputs', { inputs: { description: '', required: [] } }],
      ['modelCapabilities', { modelCapabilities: [] }],
      ['successCriteria', { successCriteria: [] }],
      ['failureCriteria', { failureCriteria: [] }],
      ['costLimitUsd', { costLimitUsd: 0 }],
      ['timeLimitMs', { timeLimitMs: 0 }],
      ['escalation', { escalation: { to: 'nova', when: [] } }],
      ['ledger', { ledger: { mustRecord: [], requiresObjectiveEvidence: true } }],
    ];
    for (const [field, over] of omissions) {
      assert.throws(() => validateContract(base(over)), ContractError, `${field} must be required`);
    }
  });

  test('rejects a contract that can spawn but has zero depth', () => {
    assert.throws(() => validateContract(base({ canSpawn: ['x'], maxDepth: 0 })), /contradictory/);
  });

  test('rejects canSpawn pointing at an unregistered agent', () => {
    const r = new AgentRegistry();
    assert.throws(() => r.registerAll([base({ canSpawn: ['ghost'], maxDepth: 1 })]),
      /unknown agent 'ghost'/);
  });

  test('rejects spawn cycles', () => {
    const r = new AgentRegistry();
    assert.throws(() => r.registerAll([
      base({ id: 'a', canSpawn: ['b'], maxDepth: 2 }),
      base({ id: 'b', canSpawn: ['a'], maxDepth: 2 }),
    ]), /spawn cycle/);
  });

  test('the critic cannot write, so it can never review its own output', () => {
    assert.ok(!CRITIC.authorizedTools.some((t) => t.startsWith('fs.write')));
    assert.equal(CRITIC.maxBlastRadius, 'none');
  });

  test('no agent in the roster holds financial authority', () => {
    for (const c of ROSTER) {
      assert.notEqual(c.maxBlastRadius, 'financial', `${c.id} must not hold financial authority`);
      assert.notEqual(c.maxBlastRadius, 'destructive', `${c.id} must not be destructive`);
    }
  });
});

describe('grants — authority only narrows', () => {
  const reg = new AgentRegistry();
  reg.registerAll(ROSTER);
  const mkRoot = (over: { budgetUsd?: number; now?: number } = {}) =>
    rootGrant(NOVA, { runId: 'run-1', objective: 'test', ...over });

  test('a root grant cannot exceed the contract cost limit', () => {
    const g = rootGrant(NOVA, { runId: 'r', objective: 'o', budgetUsd: 999 });
    assert.equal(g.budgetUsd, NOVA.costLimitUsd);
  });

  test("a child's tools are a subset of its parent's", () => {
    const parent = mkRoot();
    const child = deriveChild(parent, KIMI_RESEARCH, { objective: 'research x' });
    for (const t of child.tools) {
      assert.ok(parent.tools.includes(t), `child holds '${t}' which parent lacks`);
    }
    // KIMI declares net.fetch; NOVA does not hold it, so it must be stripped.
    assert.ok(KIMI_RESEARCH.authorizedTools.includes('net.fetch'));
    assert.ok(!child.tools.includes('net.fetch'), 'net.fetch must not be granted by a parent lacking it');
  });

  test("a child's budget cannot exceed the parent's remaining budget", () => {
    const parent = spend(mkRoot({ budgetUsd: 1.0 }), 0.9);
    assert.ok(Math.abs(remaining(parent) - 0.1) < 1e-9);
    const child = deriveChild(parent, KIMI_RESEARCH, { objective: 'x', budgetUsd: 99 });
    assert.ok(child.budgetUsd <= 0.1 + 1e-9, `child got ${child.budgetUsd}`);
  });

  test("a child's deadline is never later than its parent's", () => {
    const now = Date.now();
    const parent = rootGrant(
      { ...NOVA, timeLimitMs: 1_000 }, { runId: 'r', objective: 'o', now });
    const child = deriveChild(parent, KIMI_RESEARCH, {
      objective: 'x', timeLimitMs: 999_999, now,
    });
    assert.ok(child.deadline <= parent.deadline);
  });

  test("a child's blast radius is capped by its parent's", () => {
    const parent = mkRoot(); // NOVA is 'local'
    const child = deriveChild(parent, KIMI_RESEARCH, { objective: 'x' }); // declares 'external'
    assert.equal(child.maxBlastRadius, 'local', 'child must not exceed parent blast radius');
  });

  test('an agent cannot spawn something outside its canSpawn list', () => {
    const parent = rootGrant(KIMI_RESEARCH, { runId: 'r', objective: 'o' });
    assert.throws(() => deriveChild(parent, CRITIC, { objective: 'x' }),
      /not authorized to spawn/);
  });

  test('depth is bounded', () => {
    const parent = rootGrant({ ...NOVA, maxDepth: 1 }, { runId: 'r', objective: 'o' });
    const child = deriveChild(parent, KIMI_RESEARCH, { objective: 'x' });
    assert.equal(child.depth, 1);
    assert.throws(() => deriveChild(child, CRITIC, { objective: 'y' }), GrantError);
  });

  test('an exhausted grant cannot delegate', () => {
    const parent = spend(mkRoot({ budgetUsd: 0.5 }), 0.5);
    assert.throws(() => deriveChild(parent, KIMI_RESEARCH, { objective: 'x' }), /no budget left/);
  });

  test('an expired grant cannot delegate', () => {
    const now = Date.now();
    const parent = rootGrant({ ...NOVA, timeLimitMs: 1 }, { runId: 'r', objective: 'o', now });
    assert.equal(isExpired(parent, now + 10), true);
    assert.throws(() => deriveChild(parent, KIMI_RESEARCH, { objective: 'x', now: now + 10 }),
      /expired/);
  });

  test('grants are frozen — authority cannot be widened by assignment', () => {
    const g = mkRoot({ budgetUsd: 0.1 });
    assert.throws(() => { (g as unknown as { budgetUsd: number }).budgetUsd = 1000; });
    assert.equal(g.budgetUsd, 0.1);
    assert.throws(() => { (g.tools as string[]).push('trade.execute'); });
    assert.ok(!g.tools.includes('trade.execute'));
  });

  test('spend returns a new grant rather than mutating the old one', () => {
    const g = mkRoot({ budgetUsd: 1 });
    const after = spend(g, 0.25);
    assert.equal(g.spentUsd, 0, 'original grant must be untouched');
    assert.equal(after.spentUsd, 0.25);
  });

  test('permits() enforces tool, budget, deadline and blast radius', () => {
    const g = mkRoot({ budgetUsd: 1 });
    assert.equal(permits(g, 'model.infer', 'local').ok, true);
    assert.equal(permits(g, 'trade.execute', 'local').ok, false);
    assert.equal(permits(g, 'model.infer', 'financial').ok, false);
    assert.equal(permits(spend(g, 1), 'model.infer', 'local').ok, false);
    assert.equal(permits(g, 'model.infer', 'local', g.deadline + 1).ok, false);
  });

  test('a grandchild cannot regain authority its parent lost', () => {
    // NOVA(local, no net.fetch) -> wayfinder(external, net.fetch) must lose both.
    const parent = mkRoot();
    const child = deriveChild(parent, reg.get('wayfinder'), { objective: 'scan' });
    assert.ok(!child.tools.includes('net.fetch'));
    assert.equal(child.maxBlastRadius, 'local');
    assert.equal(permits(child, 'net.fetch', 'external').ok, false);
  });
});
