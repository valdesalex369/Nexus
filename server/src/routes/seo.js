const { Router } = require('express');
const agents = require('../agents');

const router = Router();

// POST /api/seo/audit — audit content or URL for SEO issues
router.post('/audit', async (req, res) => {
  const { content, url } = req.body;
  if (!content && !url) {
    return res.status(400).json({ error: 'content or url is required' });
  }
  try {
    const result = await agents.seo.audit(content || '', url);
    res.json({ agent: 'SEOAgent', result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/seo/meta — generate meta tags for a topic
router.post('/meta', async (req, res) => {
  const { topic, platform } = req.body;
  if (!topic) {
    return res.status(400).json({ error: 'topic is required' });
  }
  try {
    const result = await agents.seo.generateMeta(topic, platform);
    res.json({ agent: 'SEOAgent', result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/seo/optimize — optimize content for target keywords
router.post('/optimize', async (req, res) => {
  const { content, keywords, platform } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }
  try {
    const result = await agents.seo.optimize(content, keywords || platform || 'general');
    res.json({ agent: 'SEOAgent', result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/seo/keywords — research keywords for a topic
router.post('/keywords', async (req, res) => {
  const { topic, platform } = req.body;
  if (!topic) {
    return res.status(400).json({ error: 'topic is required' });
  }
  try {
    const result = await agents.seo.researchKeywords(topic, platform);
    res.json({ agent: 'SEOAgent', result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/seo/optimize-and-approve — optimize then require Telegram approval
router.post('/optimize-and-approve', async (req, res) => {
  const { content, platform } = req.body;
  if (!content || !platform) {
    return res.status(400).json({ error: 'content and platform are required' });
  }
  try {
    const result = await agents.seo.optimizeAndApprove(content, platform);
    res.json({ agent: 'SEOAgent', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
