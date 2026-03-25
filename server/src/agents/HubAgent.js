const BaseAgent = require('./BaseAgent');

class HubAgent extends BaseAgent {
  constructor() {
    super(
      'HubAgent',
      'orchestrator',
      `You are HubAgent, the central orchestrator for a social media automation platform called Nexus.
Your job is to coordinate tasks between other agents (ContentAgent and MarketAgent).
When given a goal, break it down into subtasks and explain which agent should handle each part.
Be concise and structured in your responses. Return JSON when possible.`
    );
  }

  async plan(goal) {
    const prompt = `Break this goal into subtasks and assign each to either ContentAgent or MarketAgent:\n\nGoal: ${goal}`;
    return this.run(prompt);
  }

  /**
   * Plan and request approval before delegating to other agents.
   */
  async planAndApprove(goal) {
    const plan = await this.plan(goal);

    const approved = await this.requestApproval(
      'Execute multi-agent plan',
      `Goal: ${goal}\n\nPlan:\n${plan}`
    );

    return { plan, approved };
  }
}

module.exports = HubAgent;
