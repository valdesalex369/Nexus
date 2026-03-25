const Anthropic = require('@anthropic-ai/sdk');
const telegram = require('../telegram');

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

    // 1. Notify task start
    await telegram.notifyTaskStart(this.name, userMessage);

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

      // 2. Notify task complete
      await telegram.notifyTaskComplete(this.name, userMessage, result);

      return result;
    } catch (err) {
      this.status = 'error';

      // 3. Alert on error
      await telegram.notifyError(this.name, userMessage, err.message);

      throw err;
    }
  }

  /**
   * Request approval before a sensitive action (spending money, posting publicly).
   * Returns true if approved, false if denied/timed out.
   */
  async requestApproval(action, details) {
    return telegram.requestApproval(this.name, action, details);
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
