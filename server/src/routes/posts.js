const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');

const router = Router();

// In-memory store (swap for DB later)
const posts = [];

// GET /api/posts — list scheduled posts
router.get('/', (req, res) => {
  res.json(posts);
});

// POST /api/posts — schedule a new post
router.post('/', (req, res) => {
  const { platform, content, scheduledAt } = req.body;
  if (!platform || !content) {
    return res.status(400).json({ error: 'platform and content are required' });
  }

  const post = {
    id: uuidv4(),
    platform,
    content,
    scheduledAt: scheduledAt || null,
    status: scheduledAt ? 'scheduled' : 'draft',
    createdAt: new Date().toISOString(),
  };

  posts.push(post);
  res.status(201).json(post);
});

// DELETE /api/posts/:id — remove a post
router.delete('/:id', (req, res) => {
  const idx = posts.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Post not found' });
  posts.splice(idx, 1);
  res.json({ deleted: true });
});

module.exports = router;
