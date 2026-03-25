const { Router } = require('express');
const agents = require('../agents');
const telegram = require('../telegram');

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

// POST /api/agents/:name/run — execute an agent (no approval gate)
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

// POST /api/agents/:name/run-with-approval — execute with Telegram approval gate
router.post('/:name/run-with-approval', async (req, res) => {
  const agent = agents[req.params.name];
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { message, topic, platform, niche, budget } = req.body;

  try {
    let result;
    switch (req.params.name) {
      case 'hub':
        result = await agent.planAndApprove(message || topic);
        break;
      case 'content':
        result = await agent.createAndApprove(topic, platform || 'twitter');
        break;
      case 'market':
        result = await agent.analyzePaid(platform || 'twitter', niche || 'general', budget || 0);
        break;
      default:
        result = await agent.run(message);
    }
    res.json({ agent: req.params.name, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/approvals/pending — list pending Telegram approvals
router.get('/approvals/pending', (req, res) => {
  const pending = [];
  for (const [id, entry] of telegram.pendingApprovals) {
    pending.push({
      id,
      agent: entry.agent,
      action: entry.action,
      details: entry.details,
      createdAt: entry.createdAt,
    });
  }
  res.json(pending);
});

module.exports = router;
