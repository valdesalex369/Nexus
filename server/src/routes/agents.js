const { Router } = require('express');
const agents = require('../agents');

const router = Router();

// GET /api/agents — list all agents and their status
router.get('/', (req, res) => {
  const list = Object.values(agents).map((a) => a.toJSON());
  res.json(list);
});

// GET /api/agents/:name — get single agent details
router.get('/:name', (req, res) => {
  const agent = agents[req.params.name];
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json({ ...agent.toJSON(), history: agent.history.slice(-10) });
});

// POST /api/agents/:name/run — execute an agent
router.post('/:name/run', async (req, res) => {
  const agent = agents[req.params.name];
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { message, topic, platform, niche } = req.body;

  try {
    let result;
    switch (req.params.name) {
      case 'hub':
        result = await agent.plan(message || topic);
        break;
      case 'content':
        result = await agent.createPost(topic, platform || 'twitter');
        break;
      case 'market':
        result = await agent.analyze(platform || 'twitter', niche || 'general');
        break;
      default:
        result = await agent.run(message);
    }
    res.json({ agent: req.params.name, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
