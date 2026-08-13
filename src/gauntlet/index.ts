/**
 * THE GAUNTLET
 *
 * A bounded, multi-model critique loop:
 *
 *   build -> critique (different provider) -> verify (real evidence) -> score
 *     -> pass? deploy : revise, until a termination condition fires
 *
 * The objective is infinite improvement, not infinite execution. Every run is
 * therefore bounded on FIVE independent axes, any one of which stops it:
 *
 *   1. iteration limit      3. wall-clock timeout      5. stall detection
 *   2. spend budget         4. pass threshold
 *
 * A run that cannot compute its own cost (unknown provider pricing) is treated
 * as a budget risk and escalates rather than looping blind.
 *
 * Every step is written to the ledger before the next step begins, so a crashed
 * run still leaves a complete, hash-chained account of what it did.
 */
import { Ledger } from '../ledger/index.ts';
import { Policy } from '../policy/index.ts';
import type { Router, Capability } from '../router/index.ts';
import type { Verifier, Evidence } from '../eval/index.ts';

export type GauntletStatus =
  | 'passed'
  | 'failed.iterations'
  | 'failed.budget'
  | 'failed.timeout'
  | 'failed.stalled'
  | 'escalated.cost-unknown'
  | 'escalated.subjective-only'
  | 'error';

export interface GauntletConfig {
  objective: string;
  /** Extra context handed to the builder each iteration. */
  context?: string;
  buildCapability?: Capability;
  critiqueCapability?: Capability;
  verifier: Verifier;
  maxIterations?: number;
  budgetUsd?: number;
  timeoutMs?: number;
  /** Verified score at or above which the run passes. */
  passScore?: number;
  /** Consecutive non-improving iterations tolerated before declaring a stall. */
  patience?: number;
  /** Minimum score delta that counts as improvement. */
  minImprovement?: number;
  maxTokens?: number;
}

export interface GauntletIteration {
  n: number;
  artifact: string;
  critique: string;
  evidence: Evidence;
  costUsd: number | null;
  builder: { provider: string; model: string };
  critic: { provider: string; model: string } | null;
}

export interface GauntletResult {
  runId: string;
  status: GauntletStatus;
  iterations: GauntletIteration[];
  bestArtifact: string | null;
  bestScore: number;
  totalCostUsd: number;
  costComplete: boolean;
  elapsedMs: number;
  reason: string;
}

const DEFAULTS = {
  buildCapability: 'engineering.build' as Capability,
  critiqueCapability: 'critique' as Capability,
  maxIterations: 4,
  budgetUsd: 1.0,
  timeoutMs: 10 * 60_000,
  passScore: 1.0,
  patience: 2,
  minImprovement: 0.01,
  maxTokens: 8_000,
};

export class Gauntlet {
  private router: Router;
  private ledger: Ledger;
  private policy: Policy;

  constructor(router: Router, ledger: Ledger, policy: Policy = new Policy()) {
    this.router = router;
    this.ledger = ledger;
    this.policy = policy;
  }

  async run(cfg: GauntletConfig): Promise<GauntletResult> {
    const c = { ...DEFAULTS, ...cfg };
    const runId = Ledger.newRunId();
    const startedAt = Date.now();
    const iterations: GauntletIteration[] = [];

    let spent = 0;
    let costComplete = true;
    let bestScore = -1;
    let bestArtifact: string | null = null;
    let staleFor = 0;
    let artifact = '';

    const elapsed = () => Date.now() - startedAt;
    const finish = (status: GauntletStatus, reason: string): GauntletResult => {
      this.ledger.append({
        runId, kind: 'run.end', actor: 'gauntlet', task: c.objective,
        payload: { status, iterations: iterations.length },
        evidence: { bestScore, reason }, costUsd: spent, latencyMs: elapsed(),
        confidence: bestScore >= 0 ? bestScore : undefined,
      });
      return {
        runId, status, iterations, bestArtifact, bestScore: Math.max(bestScore, 0),
        totalCostUsd: spent, costComplete, elapsedMs: elapsed(), reason,
      };
    };

    this.ledger.append({
      runId, kind: 'run.start', actor: 'gauntlet', task: c.objective,
      payload: {
        objective: c.objective, verifier: c.verifier.name,
        limits: {
          maxIterations: c.maxIterations, budgetUsd: c.budgetUsd,
          timeoutMs: c.timeoutMs, passScore: c.passScore, patience: c.patience,
        },
      },
    });

    try {
      for (let n = 1; n <= c.maxIterations; n++) {
        if (elapsed() > c.timeoutMs) return finish('failed.timeout', `exceeded ${c.timeoutMs}ms`);
        if (spent >= c.budgetUsd) return finish('failed.budget', `spent $${spent.toFixed(4)}`);
        if (!this.policy.withinRunBudget(spent)) {
          return finish('failed.budget', `policy ceiling $${this.policy.config.maxRunUsd}`);
        }

        // ---- BUILD ---------------------------------------------------------
        const buildPrompt = this.buildPrompt(c.objective, c.context, artifact,
          iterations.at(-1)?.critique, iterations.at(-1)?.evidence);
        const built = await this.router.route({
          capability: c.buildCapability,
          system: 'You are the builder. Produce the complete artifact requested — not a plan, '
            + 'not a description of one. Output only the artifact itself.',
          messages: [{ role: 'user', content: buildPrompt }],
          maxTokens: c.maxTokens,
          effort: 'high',
        });
        artifact = built.text;
        spent += built.costUsd ?? 0;
        if (built.costUnknown) costComplete = false;

        this.ledger.append({
          runId, kind: 'action', actor: 'builder', task: c.objective,
          model: built.model, tools: ['router'],
          payload: { iteration: n, provider: built.provider, chars: artifact.length },
          costUsd: built.costUsd ?? 0, latencyMs: built.latencyMs,
        });

        // ---- VERIFY (objective evidence) ------------------------------------
        const evidence = await c.verifier.verify(artifact);
        this.ledger.append({
          runId, kind: 'evaluation', actor: c.verifier.name, task: c.objective,
          payload: { iteration: n, passed: evidence.passed, score: evidence.score },
          evidence: evidence.raw, confidence: evidence.score,
        });

        // ---- CRITIQUE (a different provider than the builder) ----------------
        let critique = '';
        let critic: { provider: string; model: string } | null = null;
        if (!evidence.passed) {
          try {
            const crit = await this.router.route({
              capability: c.critiqueCapability,
              system: 'You are an adversarial critic. The artifact below FAILED verification. '
                + 'Say precisely what is wrong and what to change. Be specific and terse. '
                + 'Do not rewrite the artifact.',
              messages: [{
                role: 'user',
                content: `OBJECTIVE:\n${c.objective}\n\nVERIFIER (${c.verifier.name}) SAID:\n`
                  + `${evidence.detail}\n\nARTIFACT:\n${artifact}`,
              }],
              maxTokens: 2_000,
              effort: 'medium',
            }, [built.provider]); // never let the builder grade its own homework
            critique = crit.text;
            critic = { provider: crit.provider, model: crit.model };
            spent += crit.costUsd ?? 0;
            if (crit.costUnknown) costComplete = false;
            this.ledger.append({
              runId, kind: 'decision', actor: 'critic', task: c.objective,
              model: crit.model, payload: { iteration: n, provider: crit.provider },
              costUsd: crit.costUsd ?? 0, latencyMs: crit.latencyMs,
            });
          } catch (err) {
            // No second provider available. The loop continues on verifier
            // evidence alone, but the gap is recorded rather than hidden.
            critique = `(no independent critic available: ${(err as Error).message})`;
            this.ledger.append({
              runId, kind: 'escalation', actor: 'gauntlet',
              payload: { iteration: n, issue: 'no-independent-critic' },
              error: (err as Error).message,
            });
          }
        }

        iterations.push({
          n, artifact, critique, evidence,
          costUsd: built.costUsd,
          builder: { provider: built.provider, model: built.model },
          critic,
        });

        // ---- SCORE & TERMINATE ----------------------------------------------
        if (evidence.score > bestScore + c.minImprovement) {
          staleFor = 0;
        } else {
          staleFor++;
        }
        if (evidence.score > bestScore) {
          bestScore = evidence.score;
          bestArtifact = artifact;
        }

        if (evidence.passed && evidence.score >= c.passScore) {
          if (evidence.subjective) {
            return finish('escalated.subjective-only',
              'passed on model judgement alone; needs a human or an objective verifier');
          }
          return finish('passed', `verified by ${c.verifier.name}: ${evidence.detail}`);
        }

        if (!costComplete && spent === 0) {
          return finish('escalated.cost-unknown',
            'provider pricing is unknown, so the spend budget cannot be enforced');
        }
        if (staleFor >= c.patience) {
          return finish('failed.stalled', `no improvement over ${staleFor} iterations`);
        }
      }
      return finish('failed.iterations', `exhausted ${c.maxIterations} iterations`);
    } catch (err) {
      this.ledger.append({
        runId, kind: 'error', actor: 'gauntlet', task: c.objective,
        error: (err as Error).message,
      });
      return finish('error', (err as Error).message);
    }
  }

  private buildPrompt(
    objective: string, context: string | undefined, prior: string,
    critique: string | undefined, evidence: Evidence | undefined,
  ): string {
    const parts = [`OBJECTIVE:\n${objective}`];
    if (context) parts.push(`CONTEXT:\n${context}`);
    if (prior) {
      parts.push(`YOUR PREVIOUS ATTEMPT:\n${prior}`);
      if (evidence) parts.push(`IT FAILED VERIFICATION:\n${evidence.detail}`);
      if (critique) parts.push(`CRITIC SAID:\n${critique}`);
      parts.push('Produce a corrected, complete artifact that addresses every point above.');
    }
    return parts.join('\n\n');
  }
}
