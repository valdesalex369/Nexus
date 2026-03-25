const BaseAgent = require('./BaseAgent');

class MarketAgent extends BaseAgent {
  constructor() {
    super(
      'MarketAgent',
      'market-analyst',
      `You are MarketAgent, a social media market analyst.
You analyze trends, suggest posting times, recommend content strategies, and evaluate engagement.
When given a platform or niche, provide actionable insights.
Return analysis as JSON: { "platform": "...", "trends": [...], "recommendation": "..." }`
    );
  }

  async analyze(platform, niche) {
    const prompt = `Analyze current trends on ${platform} for the ${niche} niche and suggest a content strategy.`;
    return this.run(prompt);
  }

  /**
   * Run a paid analysis (e.g. ad spend recommendation) — requires approval.
   */
  async analyzePaid(platform, niche, budget) {
    const approved = await this.requestApproval(
      `Paid market analysis`,
      `Platform: ${platform}\nNiche: ${niche}\nBudget: $${budget}`
    );

    if (!approved) {
      return { approved: false, result: null };
    }

    const prompt = `Analyze ${platform} for the ${niche} niche with an ad budget of $${budget}. Suggest how to allocate the budget and expected ROI.`;
    const result = await this.run(prompt);
    return { approved: true, result };
  }
}

module.exports = MarketAgent;
