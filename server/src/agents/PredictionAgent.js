const BaseAgent = require('./BaseAgent');

class PredictionAgent extends BaseAgent {
  constructor() {
    super(
      'PredictionAgent',
      'prediction-analyst',
      `You are PredictionAgent, a forecasting analyst for social media performance.
You predict engagement rates, optimal posting times, viral potential, and audience growth.
When given content or a campaign, estimate its performance with confidence intervals.
Return predictions as JSON: { "platform": "...", "predictedEngagement": "...", "confidence": "...", "optimalTime": "...", "reasoning": "..." }`
    );
  }

  async predict(content, platform) {
    const prompt = `Predict the engagement performance of this ${platform} content:\n\n${content}`;
    return this.run(prompt);
  }

  async forecastCampaign(campaign, platforms, budget) {
    const prompt = `Forecast results for this campaign across ${platforms.join(', ')}:\n\nCampaign: ${campaign}\nBudget: $${budget}`;
    return this.run(prompt);
  }

  /**
   * Budget forecast — requires approval since it involves spending decisions.
   */
  async forecastWithApproval(campaign, platforms, budget) {
    const { approved, reason } = await this.requestApproval(
      `Budget forecast ($${budget})`,
      `Campaign: ${campaign}\nPlatforms: ${platforms.join(', ')}\nBudget: $${budget}\n\nThis will generate spend recommendations.`
    );

    if (!approved) {
      return { approved: false, reason, result: null };
    }

    const result = await this.forecastCampaign(campaign, platforms, budget);
    return { approved: true, reason, result };
  }
}

module.exports = PredictionAgent;
