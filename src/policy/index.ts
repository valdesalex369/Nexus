/**
 * POLICY ENGINE — bounded authority.
 *
 * Every consequential action is a *proposal* until this module rules on it.
 * The ruling is one of: allow | require_approval | deny. Nothing in NEXUS
 * calls out to the world without passing through `Policy.rule()` first.
 *
 * Two independent axes govern a proposal:
 *
 *   1. CAPITAL LEVEL (0-5) — how much financial authority the system has
 *      earned. Level is set by Alex in the environment; the system cannot
 *      raise its own level. Any code path that tries is a bug, and the
 *      escalation test in test/policy.test.ts exists to catch it.
 *
 *   2. BLAST RADIUS — how reversible the action is, independent of money.
 *      Reading a public web page and force-pushing to main are both "free"
 *      and are not remotely the same risk.
 */

export const CAPITAL_LEVELS = {
  0: 'read-only intelligence',
  1: 'read-only financial data',
  2: 'paper trading / simulated execution',
  3: 'capped experimental capital',
  4: 'programmatic treasury with hard limits',
  5: 'constrained autonomous allocation',
} as const;

export type CapitalLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** How hard is this to undo? Drives approval independent of cost. */
export type BlastRadius =
  | 'none'        // pure computation, no external effect
  | 'local'       // writes inside the repo/workspace; git-revertable
  | 'external'    // leaves the machine but is reversible (draft, sandbox write)
  | 'published'   // visible to third parties; retraction is imperfect (email, post, PR)
  | 'financial'   // moves real money
  | 'destructive';// deletes or overwrites state that cannot be reconstructed

export interface ActionProposal {
  /** Stable identifier, e.g. 'net.fetch', 'git.push', 'email.send', 'trade.execute'. */
  capability: string;
  actor: string;
  blastRadius: BlastRadius;
  /** Real money moved by this action, in USD. Not the inference cost. */
  amountUsd?: number;
  /** Inference/tool spend this action would incur. */
  costUsd?: number;
  summary: string;
  reversible?: boolean;
}

export type Ruling =
  | { decision: 'allow'; reason: string }
  | { decision: 'require_approval'; reason: string }
  | { decision: 'deny'; reason: string };

export interface PolicyConfig {
  capitalLevel: CapitalLevel;
  /** Hard ceiling on inference spend for a single run. */
  maxRunUsd: number;
  /** Hard ceiling on real money in a single action, subject to capital level. */
  maxTransactionUsd: number;
  /** Capabilities the system may exercise without asking. */
  allowedCapabilities: string[];
  /** Capabilities that are never permitted, whatever the level. Checked first. */
  forbiddenCapabilities: string[];
}

/**
 * Actions that stay forbidden at every capital level. These are not
 * "high risk" — they are outside the system's remit by construction.
 */
const HARD_FORBIDDEN = [
  'credentials.exfiltrate',
  'security.disable',
  'policy.selfmodify',
  'ledger.rewrite',
  'human.impersonate',
];

/** Maximum real money a single action may move, by earned capital level. */
const TXN_CEILING_BY_LEVEL: Record<CapitalLevel, number> = {
  0: 0, 1: 0, 2: 0, 3: 100, 4: 1_000, 5: 10_000,
};

export const DEFAULT_CONFIG: PolicyConfig = {
  capitalLevel: 0,
  maxRunUsd: 1.0,
  maxTransactionUsd: 0,
  allowedCapabilities: ['net.fetch', 'fs.read', 'fs.write.workspace', 'db.write.ledger', 'model.infer'],
  forbiddenCapabilities: [],
};

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): PolicyConfig {
  const rawLevel = Number(env.NEXUS_CAPITAL_LEVEL ?? 0);
  const level = (Number.isInteger(rawLevel) && rawLevel >= 0 && rawLevel <= 5
    ? rawLevel : 0) as CapitalLevel;
  const maxRunUsd = Number(env.NEXUS_MAX_RUN_USD ?? 1.0);
  return {
    ...DEFAULT_CONFIG,
    capitalLevel: level,
    maxRunUsd: Number.isFinite(maxRunUsd) && maxRunUsd >= 0 ? maxRunUsd : DEFAULT_CONFIG.maxRunUsd,
    maxTransactionUsd: TXN_CEILING_BY_LEVEL[level],
  };
}

export class Policy {
  readonly config: PolicyConfig;

  constructor(config: PolicyConfig = configFromEnv()) {
    this.config = config;
  }

  /** Capital level is read from config only. There is deliberately no setter. */
  get capitalLevel(): CapitalLevel { return this.config.capitalLevel; }

  rule(p: ActionProposal): Ruling {
    // 1. Absolute prohibitions, before anything else.
    if (HARD_FORBIDDEN.includes(p.capability)) {
      return { decision: 'deny', reason: `'${p.capability}' is forbidden at every capital level` };
    }
    if (this.config.forbiddenCapabilities.includes(p.capability)) {
      return { decision: 'deny', reason: `'${p.capability}' is on this deployment's forbidden list` };
    }

    // 2. Money. Real funds are gated by earned level, then by amount.
    const amount = p.amountUsd ?? 0;
    if (amount > 0 || p.blastRadius === 'financial') {
      if (this.capitalLevel <= 1) {
        return {
          decision: 'deny',
          reason: `capital level ${this.capitalLevel} (${CAPITAL_LEVELS[this.capitalLevel]}) ` +
            'does not permit moving funds',
        };
      }
      if (this.capitalLevel === 2) {
        return {
          decision: 'deny',
          reason: 'capital level 2 is simulation only: route this through paper execution',
        };
      }
      if (amount > this.config.maxTransactionUsd) {
        return {
          decision: 'deny',
          reason: `$${amount} exceeds the $${this.config.maxTransactionUsd} ceiling at level ${this.capitalLevel}`,
        };
      }
      return {
        decision: 'require_approval',
        reason: `real funds ($${amount}) always require Alex's explicit approval`,
      };
    }

    // 3. Irreversibility, independent of money.
    if (p.blastRadius === 'destructive') {
      return { decision: 'require_approval', reason: 'destructive actions are never auto-approved' };
    }
    if (p.blastRadius === 'published') {
      return {
        decision: 'require_approval',
        reason: 'third parties would see this; retraction is imperfect',
      };
    }

    // 4. Capability allowlist.
    if (!this.config.allowedCapabilities.includes(p.capability)) {
      return {
        decision: 'require_approval',
        reason: `'${p.capability}' is not on the allowlist; escalating rather than assuming`,
      };
    }

    return { decision: 'allow', reason: `'${p.capability}' is allowlisted and reversible` };
  }

  /** Would this run exceed its inference budget? Called by the Gauntlet each iteration. */
  withinRunBudget(spentUsd: number): boolean {
    return spentUsd < this.config.maxRunUsd;
  }

  describe(): string {
    const c = this.config;
    return [
      `capital level : ${c.capitalLevel} — ${CAPITAL_LEVELS[c.capitalLevel]}`,
      `run budget    : $${c.maxRunUsd.toFixed(2)}`,
      `txn ceiling   : $${c.maxTransactionUsd.toFixed(2)}`,
      `allowlist     : ${c.allowedCapabilities.join(', ')}`,
    ].join('\n');
  }
}
