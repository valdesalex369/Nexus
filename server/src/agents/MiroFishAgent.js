const BaseAgent = require('./BaseAgent');

const SWARM_AGENTS = [
  { name: 'TrendAgent', lens: 'momentum and trend-following signals. Look at price direction, moving averages, and trend strength.' },
  { name: 'MeanRevAgent', lens: 'mean-reversion signals. Look for overextended moves, RSI extremes, and deviation from fair value.' },
  { name: 'ContrarianAgent', lens: 'contrarian signals. Look for crowded trades, extreme sentiment, and fading momentum.' },
  { name: 'VolumeSpikeAgent', lens: 'volume anomalies. Look for unusual volume spikes, declining volume on rallies, and accumulation/distribution.' },
  { name: 'WhaleVoteAgent', lens: 'whale behavior signals. Interpret large wallet movements, exchange flows, and smart money positioning.' },
];

class MiroFishAgent extends BaseAgent {
  constructor() {
    super(
      'MiroFishAgent',
      'swarm-consensus',
      `You are MiroFishAgent, a swarm intelligence coordinator.
You run 5 independent analyst sub-agents, each with a different lens, then synthesize their votes into a consensus signal.
Always return JSON: { "consensus": "bullish|bearish|neutral", "confidence": 0-100, "votes": [...], "dissent": "..." }`
    );
  }

  async runSwarm(marketData) {
    const votes = [];

    for (const sa of SWARM_AGENTS) {
      const prompt = `You are ${sa.name}. Analyze this market data through your lens: ${sa.lens}\n\nData:\n${marketData}\n\nReturn JSON: { "agent": "${sa.name}", "direction": "bullish|bearish|neutral", "confidence": 0-100, "reasoning": "..." }`;

      try {
        const result = await this.run(prompt);
        votes.push({ agent: sa.name, raw: result });
      } catch (err) {
        votes.push({ agent: sa.name, raw: null, error: err.message });
      }
    }

    const synthesisPrompt = `You have 5 swarm agent votes. Synthesize them into a consensus.\n\nVotes:\n${JSON.stringify(votes, null, 2)}\n\nReturn JSON: { "consensus": "bullish|bearish|neutral", "confidence": 0-100, "votes": [summary of each], "dissent": "any dissenting views" }`;

    return this.run(synthesisPrompt);
  }
}

module.exports = MiroFishAgent;
