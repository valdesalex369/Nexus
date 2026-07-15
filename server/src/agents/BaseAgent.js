const Anthropic = require('@anthropic-ai/sdk');
const telegram = require('../telegram');
const memory = require('../memory/zettel');
const { TOOL_DEFINITIONS, executeTool } = require('../tools/registry');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MAX_TOOL_ROUNDS = 10;

class BaseAgent {
  constructor(name, role, systemPrompt) {
    this.name = name;
    this.role = role;
    this.systemPrompt = systemPrompt;
    this.status = 'idle';
    this.lastRun = null;
    this.history = [];
    this.tools = TOOL_DEFINITIONS;
  }

  async run(userMessage) {
    this.status = 'running';
    await telegram.notifyStart(this.name, userMessage);

    const memoryContext = memory.toContext(userMessage);
    const systemWithMemory = memoryContext
      ? `${this.systemPrompt}\n\n${memoryContext}`
      : this.systemPrompt;

    const messages = [{ role: 'user', content: userMessage }];

    try {
      let finalText = '';

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: systemWithMemory,
          tools: this.tools,
          messages,
        });

        const toolBlocks = response.content.filter((b) => b.type === 'tool_use');
        const textBlocks = response.content.filter((b) => b.type === 'text');

        if (textBlocks.length > 0) {
          finalText = textBlocks.map((b) => b.text).join('\n');
        }

        if (response.stop_reason === 'end_turn' || toolBlocks.length === 0) {
          break;
        }

        messages.push({ role: 'assistant', content: response.content });

        const toolResults = [];
        for (const block of toolBlocks) {
          const result = await executeTool(block.name, block.input, this.name);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }

        messages.push({ role: 'user', content: toolResults });
      }

      this.lastRun = new Date().toISOString();
      this.status = 'idle';
      this.history.push({ input: userMessage, output: finalText, timestamp: this.lastRun });

      await telegram.notifyComplete(this.name, userMessage, finalText);
      return finalText;
    } catch (err) {
      this.status = 'error';
      await telegram.notifyError(this.name, userMessage, err.message);
      throw err;
    }
  }

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
