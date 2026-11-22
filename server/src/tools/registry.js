const memory = require('../memory/zettel');

const TOOL_DEFINITIONS = [
  {
    name: 'store_memory',
    description: 'Store a note in the Zettelkasten knowledge graph. Use this to remember observations, outcomes, decisions, or anything worth recalling later.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The content to remember' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for retrieval (e.g. "btc", "whale", "prediction")' },
        links: { type: 'array', items: { type: 'string' }, description: 'IDs of related notes to link to' },
      },
      required: ['content', 'tags'],
    },
  },
  {
    name: 'search_memory',
    description: 'Search the knowledge graph for past observations, decisions, and outcomes.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'send_telegram',
    description: 'Send a message to the operator via Telegram. Use for alerts, results, and status updates.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message to send' },
      },
      required: ['message'],
    },
  },
  {
    name: 'request_human_approval',
    description: 'Ask the operator for approval before a high-risk action (spending money, posting publicly). BLOCKS until they respond /approve or /deny.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'What action needs approval' },
        details: { type: 'string', description: 'Full details for the operator to review' },
      },
      required: ['action', 'details'],
    },
  },
  {
    name: 'call_agent',
    description: 'Invoke another NEXUS agent and get its result. Use for delegation and multi-agent orchestration.',
    input_schema: {
      type: 'object',
      properties: {
        agent: { type: 'string', enum: ['hub', 'content', 'market', 'prediction', 'seo', 'mirofish', 'onchain'], description: 'Agent to call' },
        message: { type: 'string', description: 'Task for the agent' },
      },
      required: ['agent', 'message'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch data from an HTTP URL (GET). Use for API calls, price data, on-chain queries.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        headers: { type: 'object', description: 'Optional HTTP headers' },
      },
      required: ['url'],
    },
  },
];

async function executeTool(toolName, toolInput, callingAgent) {
  switch (toolName) {
    case 'store_memory': {
      const note = memory.add(toolInput.content, toolInput.tags || [], toolInput.links || [], { agent: callingAgent });
      return JSON.stringify({ stored: true, id: note.id });
    }

    case 'search_memory': {
      const results = memory.search(toolInput.query, toolInput.limit || 5);
      return JSON.stringify(results);
    }

    case 'send_telegram': {
      const telegram = require('../telegram');
      await telegram._send(telegram._esc(toolInput.message));
      return JSON.stringify({ sent: true });
    }

    case 'request_human_approval': {
      const telegram = require('../telegram');
      const result = await telegram.requestApproval(callingAgent, toolInput.action, toolInput.details);
      return JSON.stringify(result);
    }

    case 'call_agent': {
      const agents = require('../agents');
      const target = agents[toolInput.agent];
      if (!target) return JSON.stringify({ error: `Agent '${toolInput.agent}' not found` });
      if (target.name === callingAgent) return JSON.stringify({ error: 'Cannot call self' });
      const result = await target.run(toolInput.message);
      return JSON.stringify({ agent: toolInput.agent, result });
    }

    case 'fetch_url': {
      try {
        const resp = await fetch(toolInput.url, { headers: toolInput.headers || {} });
        const text = await resp.text();
        const truncated = text.length > 4000 ? text.slice(0, 4000) + '...(truncated)' : text;
        return truncated;
      } catch (err) {
        return JSON.stringify({ error: err.message });
      }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

module.exports = { TOOL_DEFINITIONS, executeTool };
