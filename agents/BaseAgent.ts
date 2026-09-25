/**
 * BaseAgent — Abstract base class for all NEXUS agents.
 *
 * Every agent has a name, role, status, and a run() method that
 * returns an AgentResult. Agents communicate through the HubAgent.
 */

import type { AgentContext, AgentResult, AgentRole, AgentStatus } from "../shared/types";

export abstract class BaseAgent {
  public readonly name: string;
  public readonly role: AgentRole;
  public status: AgentStatus = "idle";

  constructor(name: string, role: AgentRole) {
    this.name = name;
    this.role = role;
  }

  /**
   * Execute the agent's main logic. Subclasses must implement this.
   */
  protected abstract execute(ctx: AgentContext): Promise<unknown>;

  /**
   * Public entry point — wraps execute() with timing, error handling, and status tracking.
   */
  async run(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    this.status = "running";
    console.log(`[${this.name}] Running...`);

    try {
      const data = await this.execute(ctx);
      this.status = "idle";
      const result: AgentResult = {
        agent: this.name,
        success: true,
        data,
        durationMs: Date.now() - start,
      };
      console.log(`[${this.name}] Done in ${result.durationMs}ms`);
      return result;
    } catch (err) {
      this.status = "error";
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${this.name}] Error: ${message}`);
      return {
        agent: this.name,
        success: false,
        data: null,
        error: message,
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Graceful degradation — called by HubAgent if this agent fails.
   * Returns fallback data so the pipeline continues.
   */
  fallback(): unknown {
    console.warn(`[${this.name}] Using fallback (no data)`);
    return null;
  }
}
