/**
 * EVALUATION ENGINE
 *
 * A verifier turns "the model said it worked" into "here is what happened".
 * Every verifier returns evidence a human can check after the fact — command
 * output, exit codes, match counts — not a model's opinion of its own work.
 *
 * `ModelVerifier` exists for genuinely subjective criteria, and is deliberately
 * marked `subjective: true` so the Gauntlet can refuse to treat a model's
 * self-assessment as proof.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Router, Capability } from '../router/index.ts';

const run = promisify(execFile);

export interface Evidence {
  /** Did this check pass outright? */
  passed: boolean;
  /** 0..1 quality signal. Drives improvement tracking across iterations. */
  score: number;
  /** Short human-readable finding. */
  detail: string;
  /** Raw artifact of the check: stdout, exit code, counts. */
  raw?: unknown;
  /** True when the score came from a model judging output rather than a fact. */
  subjective: boolean;
}

export interface Verifier {
  readonly name: string;
  verify(artifact: string): Promise<Evidence>;
}

/**
 * Runs a real command and reports its exit code and output.
 * This is the strongest verifier available: the world either did the thing or
 * it did not. Arguments are passed as an argv array — never through a shell —
 * so artifact content cannot become a command.
 */
export class CommandVerifier implements Verifier {
  readonly name: string;

  private command: string;
  private args: string[];
  private opts: { cwd?: string; timeoutMs?: number };

  constructor(
    name: string,
    command: string,
    args: string[] = [],
    opts: { cwd?: string; timeoutMs?: number } = {},
  ) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.opts = opts;
  }

  async verify(): Promise<Evidence> {
    try {
      const { stdout, stderr } = await run(this.command, this.args, {
        cwd: this.opts.cwd ?? process.cwd(),
        timeout: this.opts.timeoutMs ?? 120_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      return {
        passed: true, score: 1, subjective: false,
        detail: `${this.command} exited 0`,
        raw: { exitCode: 0, stdout: stdout.slice(-4000), stderr: stderr.slice(-2000) },
      };
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
      return {
        passed: false, score: 0, subjective: false,
        detail: `${this.command} failed (exit ${e.code ?? 'unknown'})`,
        raw: {
          exitCode: e.code ?? null,
          stdout: (e.stdout ?? '').slice(-4000),
          stderr: (e.stderr ?? e.message ?? '').slice(-4000),
        },
      };
    }
  }
}

/** Requires the artifact to contain every listed marker. Cheap and objective. */
export class ContainsVerifier implements Verifier {
  readonly name: string;
  private required: string[];

  constructor(name: string, required: string[]) {
    this.name = name;
    this.required = required;
  }

  async verify(artifact: string): Promise<Evidence> {
    const missing = this.required.filter((r) => !artifact.includes(r));
    const score = this.required.length === 0
      ? 1 : (this.required.length - missing.length) / this.required.length;
    return {
      passed: missing.length === 0, score, subjective: false,
      detail: missing.length === 0
        ? `all ${this.required.length} required markers present`
        : `missing ${missing.length}/${this.required.length}: ${missing.join(', ')}`,
      raw: { missing },
    };
  }
}

/** All verifiers must pass; score is the mean. */
export class AllOfVerifier implements Verifier {
  readonly name: string;
  private verifiers: Verifier[];

  constructor(name: string, verifiers: Verifier[]) {
    this.name = name;
    this.verifiers = verifiers;
  }

  async verify(artifact: string): Promise<Evidence> {
    const results = await Promise.all(this.verifiers.map((v) => v.verify(artifact)));
    const score = results.length
      ? results.reduce((s, r) => s + r.score, 0) / results.length : 0;
    return {
      passed: results.every((r) => r.passed),
      score,
      subjective: results.some((r) => r.subjective),
      detail: results.map((r, i) => `${this.verifiers[i]!.name}: ${r.detail}`).join(' | '),
      raw: Object.fromEntries(this.verifiers.map((v, i) => [v.name, results[i]!.raw])),
    };
  }
}

/**
 * Model-scored rubric, for criteria no command can check ("is this argument
 * coherent?"). Always flagged subjective — the Gauntlet will not accept a
 * subjective-only pass as evidence of completion.
 */
export class ModelVerifier implements Verifier {
  readonly name: string;

  private router: Router;
  private rubric: string;
  private capability: Capability;

  constructor(
    name: string,
    router: Router,
    rubric: string,
    capability: Capability = 'critique',
  ) {
    this.name = name;
    this.router = router;
    this.rubric = rubric;
    this.capability = capability;
  }

  async verify(artifact: string): Promise<Evidence> {
    const res = await this.router.route({
      capability: this.capability,
      system: 'You are a strict evaluator. Reply with a single line: SCORE=<0.0-1.0> followed by '
        + 'one sentence of justification. Be harsh; most first drafts score below 0.6.',
      messages: [{ role: 'user', content: `RUBRIC:\n${this.rubric}\n\nARTIFACT:\n${artifact}` }],
      maxTokens: 1_000,
      effort: 'low',
    });
    const m = res.text.match(/SCORE\s*=\s*([01](?:\.\d+)?)/i);
    const score = m ? Math.max(0, Math.min(1, Number(m[1]))) : 0;
    return {
      passed: score >= 0.8, score, subjective: true,
      detail: res.text.slice(0, 300),
      raw: { provider: res.provider, model: res.model, costUsd: res.costUsd },
    };
  }
}
