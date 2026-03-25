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
}

module.exports = MarketAgent;
