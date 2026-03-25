const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

class BaseAgent {
  constructor(name, role, systemPrompt) {
    this.name = name;
    this.role = role;
    this.systemPrompt = systemPrompt;
    this.status = 'idle';
    this.lastRun = null;
    this.history = [];
  }

  async run(userMessage) {
    this.status = 'running';
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: this.systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const result = response.content[0].text;
      this.lastRun = new Date().toISOString();
      this.status = 'idle';
      this.history.push({ input: userMessage, output: result, timestamp: this.lastRun });
      return result;
    } catch (err) {
      this.status = 'error';
      throw err;
    }
  }

  toJSON() {
    return {
      name: this.name,
      role: this.role,
      status: this.status,
      lastRun: this.lastRun,
      historyCount: this.history.length,
    };
  }
}

module.exports = BaseAgent;
