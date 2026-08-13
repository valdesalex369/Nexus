/**
 * AGENT REGISTRY
 *
 * Contracts are validated at registration, not at run time. A malformed or
 * self-contradictory agent fails when it is loaded — before anything with real
 * consequences is in flight.
 *
 * The registry also refuses spawn cycles. An agent graph with a loop can exhaust
 * budget and depth in ways that are hard to reason about, so the loop is rejected
 * at load rather than caught by a runtime guard.
 */
import type { AgentContract } from './contract.ts';
import { validateContract, ContractError } from './contract.ts';

export class AgentRegistry {
  private contracts = new Map<string, AgentContract>();

  register(c: AgentContract): void {
    validateContract(c);
    if (this.contracts.has(c.id)) {
      throw new ContractError(c.id, 'already registered');
    }
    this.contracts.set(c.id, c);
  }

  registerAll(cs: AgentContract[]): void {
    for (const c of cs) this.register(c);
    this.assertResolvable();
    this.assertAcyclic();
  }

  get(id: string): AgentContract {
    const c = this.contracts.get(id);
    if (!c) throw new ContractError(id, 'not registered');
    return c;
  }

  has(id: string): boolean { return this.contracts.has(id); }

  ids(): string[] { return [...this.contracts.keys()]; }

  all(): AgentContract[] { return [...this.contracts.values()]; }

  /** Every id named in a `canSpawn` list must actually exist. */
  assertResolvable(): void {
    for (const c of this.contracts.values()) {
      for (const child of c.canSpawn) {
        if (!this.contracts.has(child)) {
          throw new ContractError(c.id, `canSpawn references unknown agent '${child}'`);
        }
      }
    }
  }

  /** Reject spawn cycles (A spawns B spawns A). */
  assertAcyclic(): void {
    const state = new Map<string, 'visiting' | 'done'>();
    const walk = (id: string, path: string[]): void => {
      const s = state.get(id);
      if (s === 'done') return;
      if (s === 'visiting') {
        throw new ContractError(id, `spawn cycle detected: ${[...path, id].join(' -> ')}`);
      }
      state.set(id, 'visiting');
      for (const child of this.contracts.get(id)?.canSpawn ?? []) {
        walk(child, [...path, id]);
      }
      state.set(id, 'done');
    };
    for (const id of this.contracts.keys()) walk(id, []);
  }

  /** Human-readable roster, for `nexus agents`. */
  describe(): string {
    return this.all().map((c) => {
      const spawn = c.canSpawn.length ? ` spawns:[${c.canSpawn.join(', ')}]` : ' (leaf)';
      return `  ${c.id.padEnd(18)} $${c.costLimitUsd.toFixed(2).padStart(6)}  `
        + `${String(Math.round(c.timeLimitMs / 1000) + 's').padStart(6)}  `
        + `${c.maxBlastRadius.padEnd(11)} -> ${c.escalation.to}${spawn}\n`
        + `  ${' '.repeat(18)} ${c.role}`;
    }).join('\n');
  }
}
