/**
 * AGENT CONTRACT
 *
 * Every agent in NEXUS is declared as data, not prose. A contract states exactly
 * what an agent may do, what it costs, when it must stop, and who it wakes when
 * it cannot proceed. There are no "super agents" with unlimited authority —
 * an agent that has not declared a capability cannot exercise it.
 *
 * The ten required fields from the directive map one-to-one onto this type.
 * `validateContract` refuses anything incomplete, so an under-specified agent
 * fails at load time rather than mid-run with real consequences in flight.
 */
import type { Capability } from '../router/types.ts';
import type { BlastRadius } from '../policy/index.ts';

export interface InputSpec {
  /** What this agent needs to start. Free-form but required to be non-empty. */
  description: string;
  /** Named fields the caller must supply. */
  required: string[];
}

export interface OutputSpec {
  /** 'text' | 'json' | 'artifact' — what the caller should expect back. */
  kind: 'text' | 'json' | 'artifact';
  /** For json: a description of the shape. For artifact: what file/thing. */
  description: string;
}

export type EscalationTarget = 'alex' | 'nova' | 'parent';

export interface EscalationRule {
  /** Who to wake. `alex` means a human decision is required. */
  to: EscalationTarget;
  /** Conditions that force escalation regardless of anything else. */
  when: string[];
}

export interface LedgerRequirement {
  /** Event kinds this agent must emit. Enforced by review, recorded by the ledger. */
  mustRecord: string[];
  /** Whether this agent's output must carry objective (non-model) evidence. */
  requiresObjectiveEvidence: boolean;
}

export interface AgentContract {
  /** Stable identifier. Referenced by parents in `canSpawn`. */
  id: string;
  /** 1. ROLE */
  role: string;
  /** 2. INPUTS */
  inputs: InputSpec;
  /** 3. AUTHORIZED TOOLS — capability strings the Policy engine understands. */
  authorizedTools: string[];
  /** Model capabilities this agent is allowed to route to. */
  modelCapabilities: Capability[];
  /** Largest blast radius this agent may ever propose. */
  maxBlastRadius: BlastRadius;
  /** 4. OUTPUT FORMAT */
  output: OutputSpec;
  /** 5. SUCCESS CRITERIA */
  successCriteria: string[];
  /** 6. FAILURE CRITERIA */
  failureCriteria: string[];
  /** 7. COST LIMIT (USD, per invocation) */
  costLimitUsd: number;
  /** 8. TIME LIMIT (ms, per invocation) */
  timeLimitMs: number;
  /** 9. ESCALATION RULE */
  escalation: EscalationRule;
  /** 10. MEMORY / LEDGER REQUIREMENTS */
  ledger: LedgerRequirement;

  // --- Recursion governance (directive §VII) ---
  /** Agent ids this agent may spawn. Empty means it is a leaf. */
  canSpawn: string[];
  /** Hard ceiling on descendant depth below this agent. */
  maxDepth: number;
}

export class ContractError extends Error {
  readonly agentId: string;

  constructor(agentId: string, message: string) {
    super(`contract '${agentId}': ${message}`);
    this.name = 'ContractError';
    this.agentId = agentId;
  }
}

const BLAST_ORDER: BlastRadius[] = [
  'none', 'local', 'external', 'published', 'financial', 'destructive',
];

/** Rank of a blast radius; higher is more dangerous. */
export function blastRank(b: BlastRadius): number {
  return BLAST_ORDER.indexOf(b);
}

/**
 * Rejects incomplete or self-contradictory contracts. Every one of the ten
 * fields must be meaningfully populated — an empty success criterion is not a
 * contract, it is a wish.
 */
export function validateContract(c: AgentContract): void {
  const fail = (m: string) => { throw new ContractError(c.id ?? '<no id>', m); };

  if (!c.id?.trim()) fail('id is required');
  if (!c.role?.trim()) fail('role is required');
  if (!c.inputs?.description?.trim()) fail('inputs.description is required');
  if (!Array.isArray(c.inputs.required)) fail('inputs.required must be an array');
  if (!Array.isArray(c.authorizedTools)) fail('authorizedTools must be an array');
  if (!Array.isArray(c.modelCapabilities) || c.modelCapabilities.length === 0) {
    fail('modelCapabilities must list at least one capability');
  }
  if (blastRank(c.maxBlastRadius) < 0) fail(`unknown maxBlastRadius '${c.maxBlastRadius}'`);
  if (!c.output?.kind) fail('output.kind is required');
  if (!c.successCriteria?.length) fail('successCriteria must list at least one criterion');
  if (!c.failureCriteria?.length) fail('failureCriteria must list at least one criterion');
  if (!(c.costLimitUsd > 0)) fail('costLimitUsd must be greater than 0');
  if (!(c.timeLimitMs > 0)) fail('timeLimitMs must be greater than 0');
  if (!c.escalation?.to) fail('escalation.to is required');
  if (!c.escalation.when?.length) fail('escalation.when must list at least one condition');
  if (!c.ledger?.mustRecord?.length) fail('ledger.mustRecord must list at least one event kind');
  if (typeof c.ledger.requiresObjectiveEvidence !== 'boolean') {
    fail('ledger.requiresObjectiveEvidence must be explicit');
  }
  if (!Array.isArray(c.canSpawn)) fail('canSpawn must be an array (empty for leaf agents)');
  if (!Number.isInteger(c.maxDepth) || c.maxDepth < 0) fail('maxDepth must be a non-negative integer');
  if (c.canSpawn.length > 0 && c.maxDepth === 0) {
    fail('declares spawnable children but maxDepth is 0 — contradictory');
  }
}
