import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger/index.ts';
import { Policy, DEFAULT_CONFIG } from '../src/policy/index.ts';
import { Router, EchoAdapter } from '../src/router/index.ts';
import type { Adapter, Capability, InferRequest, InferResponse } from '../src/router/types.ts';
import { Gauntlet } from '../src/gauntlet/index.ts';
import { ContainsVerifier, CommandVerifier, type Verifier, type Evidence }
  from '../src/eval/index.ts';

/** Scripted adapter: returns queued replies so loop behavior is deterministic. */
class ScriptedAdapter implements Adapter {
  calls = 0;
  readonly name: string;
  readonly capabilities: readonly Capability[];
  private replies: string[];
  private costPer: number;
  private unknownCost: boolean;

  constructor(
    name: string,
    capabilities: readonly Capability[],
    replies: string[],
    costPer = 0.01,
    unknownCost = false,
  ) {
    this.name = name;
    this.capabilities = capabilities;
    this.replies = replies;
    this.costPer = costPer;
    this.unknownCost = unknownCost;
  }
  isLive() { return true; }
  darkReason() { return null; }
  modelFor() { return `${this.name}-model`; }
  async complete(_req: InferRequest): Promise<InferResponse> {
    const text = this.replies[Math.min(this.calls, this.replies.length - 1)] ?? '';
    this.calls++;
    return {
      text, provider: this.name, model: `${this.name}-model`,
      inputTokens: 10, outputTokens: 10,
      costUsd: this.unknownCost ? null : this.costPer,
      costUnknown: this.unknownCost, latencyMs: 1, stopReason: 'end_turn',
    };
  }
}

const fixture = (builder: Adapter, critic?: Adapter) => {
  const ledger = new Ledger(':memory:');
  const adapters = critic ? [builder, critic] : [builder];
  const router = new Router(adapters);
  const policy = new Policy({ ...DEFAULT_CONFIG, maxRunUsd: 10 });
  return { ledger, gauntlet: new Gauntlet(router, ledger, policy) };
};

describe('gauntlet', () => {
  test('passes as soon as the verifier is satisfied by real evidence', async () => {
    const builder = new ScriptedAdapter('b', ['engineering.build'], ['DONE token-present']);
    const { gauntlet, ledger } = fixture(builder);
    const res = await gauntlet.run({
      objective: 'emit the token',
      verifier: new ContainsVerifier('has-token', ['token-present']),
    });
    assert.equal(res.status, 'passed');
    assert.equal(res.iterations.length, 1);
    assert.equal(res.bestScore, 1);
    assert.equal(ledger.verifyChain().ok, true);
    ledger.close();
  });

  test('revises using critic feedback and passes on a later iteration', async () => {
    const builder = new ScriptedAdapter('b', ['engineering.build'], ['wrong', 'now token-present']);
    const critic = new ScriptedAdapter('c', ['critique'], ['you omitted the token']);
    const { gauntlet, ledger } = fixture(builder, critic);
    const res = await gauntlet.run({
      objective: 'emit the token',
      verifier: new ContainsVerifier('has-token', ['token-present']),
    });
    assert.equal(res.status, 'passed');
    assert.equal(res.iterations.length, 2);
    assert.equal(res.iterations[0]!.critique, 'you omitted the token');
    ledger.close();
  });

  test('never lets the builder critique its own output', async () => {
    const builder = new ScriptedAdapter('same', ['engineering.build', 'critique'], ['nope']);
    const { gauntlet, ledger } = fixture(builder);
    const res = await gauntlet.run({
      objective: 'x', maxIterations: 1,
      verifier: new ContainsVerifier('impossible', ['NEVER_APPEARS']),
    });
    // The only provider is the builder, so no independent critic is available
    // and that gap must be recorded rather than silently self-graded.
    assert.match(res.iterations[0]!.critique, /no independent critic/);
    assert.equal(res.iterations[0]!.critic, null);
    ledger.close();
  });

  test('terminates on the iteration limit', async () => {
    const builder = new ScriptedAdapter('b', ['engineering.build'], ['a', 'b', 'c', 'd', 'e']);
    const critic = new ScriptedAdapter('c', ['critique'], ['fix it']);
    const { gauntlet, ledger } = fixture(builder, critic);
    let n = 0;
    // Score climbs every iteration so the stall detector never fires first.
    const climbing: Verifier = {
      name: 'climbing',
      async verify(): Promise<Evidence> {
        n++;
        return { passed: false, score: n * 0.1, detail: `score ${n}`, subjective: false };
      },
    };
    const res = await gauntlet.run({ objective: 'x', maxIterations: 3, verifier: climbing });
    assert.equal(res.status, 'failed.iterations');
    assert.equal(res.iterations.length, 3);
    ledger.close();
  });

  test('terminates on the spend budget', async () => {
    const builder = new ScriptedAdapter('b', ['engineering.build'], ['x'], 0.5);
    const critic = new ScriptedAdapter('c', ['critique'], ['fix'], 0.5);
    const { gauntlet, ledger } = fixture(builder, critic);
    let n = 0;
    const climbing: Verifier = {
      name: 'climbing',
      async verify(): Promise<Evidence> {
        n++;
        return { passed: false, score: n * 0.1, detail: 'no', subjective: false };
      },
    };
    const res = await gauntlet.run({
      objective: 'x', maxIterations: 50, budgetUsd: 1.2, verifier: climbing,
    });
    assert.equal(res.status, 'failed.budget');
    assert.ok(res.totalCostUsd >= 1.2, `spent ${res.totalCostUsd}`);
    ledger.close();
  });

  test('terminates on a stall when the score stops improving', async () => {
    const builder = new ScriptedAdapter('b', ['engineering.build'], ['same']);
    const critic = new ScriptedAdapter('c', ['critique'], ['fix']);
    const { gauntlet, ledger } = fixture(builder, critic);
    const flat: Verifier = {
      name: 'flat',
      async verify(): Promise<Evidence> {
        return { passed: false, score: 0.5, detail: 'flat', subjective: false };
      },
    };
    const res = await gauntlet.run({
      objective: 'x', maxIterations: 20, patience: 2, verifier: flat,
    });
    assert.equal(res.status, 'failed.stalled');
    assert.ok(res.iterations.length < 20);
    ledger.close();
  });

  test('escalates instead of accepting a subjective-only pass', async () => {
    const builder = new ScriptedAdapter('b', ['engineering.build'], ['looks great']);
    const { gauntlet, ledger } = fixture(builder);
    const vibes: Verifier = {
      name: 'vibes',
      async verify(): Promise<Evidence> {
        return { passed: true, score: 1, detail: 'model liked it', subjective: true };
      },
    };
    const res = await gauntlet.run({ objective: 'x', verifier: vibes });
    assert.equal(res.status, 'escalated.subjective-only');
    ledger.close();
  });

  test('escalates when provider pricing is unknown, rather than looping blind', async () => {
    const builder = new ScriptedAdapter('b', ['engineering.build'], ['x'], 0, true);
    const { gauntlet, ledger } = fixture(builder);
    const res = await gauntlet.run({
      objective: 'x', maxIterations: 10,
      verifier: new ContainsVerifier('impossible', ['NEVER_APPEARS']),
    });
    assert.equal(res.status, 'escalated.cost-unknown');
    assert.equal(res.costComplete, false);
    ledger.close();
  });

  test('writes a complete, verifiable ledger trail for every run', async () => {
    const builder = new ScriptedAdapter('b', ['engineering.build'], ['token-present']);
    const { gauntlet, ledger } = fixture(builder);
    const res = await gauntlet.run({
      objective: 'trace me',
      verifier: new ContainsVerifier('has-token', ['token-present']),
    });
    const events = ledger.byRun(res.runId);
    const kinds = events.map((e) => e.kind);
    assert.deepEqual(kinds, ['run.start', 'action', 'evaluation', 'run.end']);
    assert.equal(ledger.verifyChain().ok, true);
    ledger.close();
  });

  test('surfaces real command evidence through CommandVerifier', async () => {
    const ok = await new CommandVerifier('true', 'node', ['-e', 'process.exit(0)']).verify();
    assert.equal(ok.passed, true);
    assert.equal(ok.subjective, false);
    const bad = await new CommandVerifier('false', 'node', ['-e', 'process.exit(3)']).verify();
    assert.equal(bad.passed, false);
    assert.equal((bad.raw as { exitCode: number }).exitCode, 3);
  });

  test('echo adapter keeps the system runnable with no credentials', async () => {
    const router = new Router([new EchoAdapter()]);
    const out = await router.route({
      capability: 'engineering.build', messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(out.provider, 'echo');
    assert.match(out.text, /no live provider configured/);
  });
});
