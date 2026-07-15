const BaseAgent = require('./BaseAgent');

class HubAgent extends BaseAgent {
  constructor() {
    super(
      'HubAgent',
      'orchestrator',
      `You are HubAgent, the central orchestrator for NEXUS — an autonomous AI agent platform.
You coordinate tasks between: ContentAgent, MarketAgent, PredictionAgent, SEOAgent, MiroFishAgent, OnChainAgent.
You have access to the call_agent tool — use it to delegate work to other agents directly.
You have access to store_memory and search_memory to persist and recall context.

When given a goal:
1. Search memory for relevant past context
2. Break the goal into subtasks
3. Call the appropriate agents using the call_agent tool
4. Synthesize their results
5. Store the outcome in memory for future reference
6. Return a structured summary

Always return JSON: { "goal": "...", "steps": [...], "results": {...}, "summary": "..." }`
    );
  }

  async plan(goal) {
    return this.run(`Plan and execute this goal by calling other agents:\n\nGoal: ${goal}`);
  }

  async execute(goal) {
    return this.plan(goal);
  }

  async planAndApprove(goal) {
    const plan = await this.plan(goal);

    const { approved, reason } = await this.requestApproval(
      'Execute multi-agent plan',
      `Goal: ${goal}\n\nPlan:\n${plan}`
    );

    return { plan, approved, reason };
  }
}

module.exports = HubAgent;
