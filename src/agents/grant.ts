/**
 * GRANTS — governed recursion.
 *
 * A contract says what an agent may do *in principle*. A grant is what it may do
 * *on this run*: a concrete lease over tools, money, time and depth.
 *
 * The one invariant that makes recursive spawning safe:
 *
 *     AUTHORITY ONLY EVER NARROWS.
 *
 * A child's tools are a subset of its parent's. Its budget comes out of the
 * parent's remaining budget. Its deadline is at or before the parent's. Its
 * blast radius is at or below the parent's. No agent can hand a child something
 * it does not itself hold, and no agent can raise its own ceiling — the fields
 * are readonly and every derivation goes through `deriveChild`, which intersects
 * rather than replaces.
 *
 * `spend()` returns a new grant rather than mutating, so a leaked reference to
 * an old grant cannot be used to reset a budget.
 */
import { randomUUID } from 'node:crypto';
import type { AgentContract, EscalationTarget } from './contract.ts';
import { blastRank } from './contract.ts';
import type { BlastRadius } from '../policy/index.ts';
import type { Capability } from '../router/types.ts';

export interface Grant {
  readonly grantId: string;
  readonly agentId: string;
  readonly parentGrantId: string | null;
  readonly runId: string;
  readonly depth: number;
  readonly maxDepth: number;
  readonly objective: string;
  readonly tools: readonly string[];
  readonly modelCapabilities: readonly Capability[];
  readonly maxBlastRadius: BlastRadius;
  readonly budgetUsd: number;
  readonly spentUsd: number;
  /** Epoch ms. */
  readonly deadline: number;
  readonly escalateTo: EscalationTarget;
  readonly canSpawn: readonly string[];
}

export class GrantError extends Error {
  constructor(message: string) { super(message); this.name = 'GrantError'; }
}

/** Root grant for a top-level agent. This is the only place authority is created. */
export function rootGrant(
  contract: AgentContract,
  opts: { runId: string; objective: string; budgetUsd?: number; now?: number },
): Grant {
  const now = opts.now ?? Date.now();
  const budget = Math.min(opts.budgetUsd ?? contract.costLimitUsd, contract.costLimitUsd);
  return Object.freeze({
    grantId: randomUUID(),
    agentId: contract.id,
    parentGrantId: null,
    runId: opts.runId,
    depth: 0,
    maxDepth: contract.maxDepth,
    objective: opts.objective,
    tools: Object.freeze([...contract.authorizedTools]),
    modelCapabilities: Object.freeze([...contract.modelCapabilities]),
    maxBlastRadius: contract.maxBlastRadius,
    budgetUsd: budget,
    spentUsd: 0,
    deadline: now + contract.timeLimitMs,
    escalateTo: contract.escalation.to,
    canSpawn: Object.freeze([...contract.canSpawn]),
  });
}

export function remaining(g: Grant): number {
  return Math.max(0, g.budgetUsd - g.spentUsd);
}

export function isExpired(g: Grant, now = Date.now()): boolean {
  return now >= g.deadline;
}

/** Record spend. Returns a new grant; never mutates. */
export function spend(g: Grant, amountUsd: number): Grant {
  if (!(amountUsd >= 0)) throw new GrantError('spend amount must be non-negative');
  return Object.freeze({ ...g, spentUsd: g.spentUsd + amountUsd });
}

/**
 * Derive a child grant. Every dimension is intersected with the parent's, so a
 * request for more authority than the parent holds is silently narrowed — and a
 * request for something the parent cannot delegate at all is rejected outright.
 */
export function deriveChild(
  parent: Grant,
  childContract: AgentContract,
  req: { objective: string; budgetUsd?: number; timeLimitMs?: number; now?: number },
): Grant {
  const now = req.now ?? Date.now();

  if (isExpired(parent, now)) {
    throw new GrantError(`grant ${parent.grantId} has expired; cannot spawn '${childContract.id}'`);
  }
  if (!parent.canSpawn.includes(childContract.id)) {
    throw new GrantError(
      `agent '${parent.agentId}' is not authorized to spawn '${childContract.id}'`);
  }
  if (parent.depth + 1 > parent.maxDepth) {
    throw new GrantError(
      `max depth ${parent.maxDepth} reached; '${parent.agentId}' cannot spawn at depth ${parent.depth + 1}`);
  }

  // Tools: strict intersection. A child never receives a tool the parent lacks.
  const tools = childContract.authorizedTools.filter((t) => parent.tools.includes(t));
  const modelCapabilities = childContract.modelCapabilities
    .filter((c) => parent.modelCapabilities.includes(c));
  if (modelCapabilities.length === 0) {
    throw new GrantError(
      `'${childContract.id}' needs model capabilities its parent '${parent.agentId}' does not hold`);
  }

  // Blast radius: the lower of the two.
  const maxBlastRadius = blastRank(childContract.maxBlastRadius) <= blastRank(parent.maxBlastRadius)
    ? childContract.maxBlastRadius : parent.maxBlastRadius;

  // Budget: bounded by the child's own limit, the request, and — critically —
  // what the parent actually has left.
  const avail = remaining(parent);
  if (avail <= 0) {
    throw new GrantError(`grant ${parent.grantId} has no budget left to delegate`);
  }
  const budgetUsd = Math.min(req.budgetUsd ?? avail, avail, childContract.costLimitUsd);

  // Deadline: never later than the parent's.
  const wanted = now + Math.min(req.timeLimitMs ?? childContract.timeLimitMs,
    childContract.timeLimitMs);
  const deadline = Math.min(wanted, parent.deadline);

  return Object.freeze({
    grantId: randomUUID(),
    agentId: childContract.id,
    parentGrantId: parent.grantId,
    runId: parent.runId,
    depth: parent.depth + 1,
    maxDepth: Math.min(childContract.maxDepth + parent.depth + 1, parent.maxDepth),
    objective: req.objective,
    tools: Object.freeze(tools),
    modelCapabilities: Object.freeze(modelCapabilities),
    maxBlastRadius,
    budgetUsd,
    spentUsd: 0,
    deadline,
    escalateTo: childContract.escalation.to,
    canSpawn: Object.freeze(childContract.canSpawn.filter((id) => parent.canSpawn.includes(id))),
  });
}

/** Does this grant permit a specific tool right now? */
export function permits(
  g: Grant, tool: string, blastRadius: BlastRadius, now = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (isExpired(g, now)) return { ok: false, reason: 'grant expired' };
  if (remaining(g) <= 0) return { ok: false, reason: 'grant budget exhausted' };
  if (!g.tools.includes(tool)) {
    return { ok: false, reason: `tool '${tool}' is not in this grant` };
  }
  if (blastRank(blastRadius) > blastRank(g.maxBlastRadius)) {
    return {
      ok: false,
      reason: `blast radius '${blastRadius}' exceeds grant ceiling '${g.maxBlastRadius}'`,
    };
  }
  return { ok: true };
}
