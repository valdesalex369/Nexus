const { Router } = require('express');
const memory = require('../memory/zettel');
const evolution = require('../memory/evolution');

const router = Router();

router.get('/', (req, res) => {
  res.json(memory.getRecent(parseInt(req.query.limit) || 20));
});

router.get('/stats', (req, res) => {
  res.json({ memory: memory.stats(), evolution: evolution.getStats() });
});

router.get('/search', (req, res) => {
  if (!req.query.q) return res.status(400).json({ error: 'q parameter required' });
  res.json(memory.search(req.query.q, parseInt(req.query.limit) || 10));
});

router.get('/tag/:tag', (req, res) => {
  res.json(memory.getByTag(req.params.tag));
});

router.get('/:id', (req, res) => {
  const note = memory.get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  const linked = memory.getLinked(req.params.id);
  res.json({ ...note, linkedNotes: linked });
});

router.post('/', (req, res) => {
  const { content, tags, links, meta } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });
  const note = memory.add(content, tags || [], links || [], meta || {});
  res.status(201).json(note);
});

router.post('/outcome', (req, res) => {
  const { prediction, actual, sources } = req.body;
  if (!prediction || !actual) return res.status(400).json({ error: 'prediction and actual required' });
  const outcome = evolution.recordOutcome(prediction, actual, sources || {});
  res.json(outcome);
});

router.get('/evolution/weights', (req, res) => {
  res.json(evolution.getWeights());
});

router.post('/evolution/recalibrate', (req, res) => {
  const weights = evolution.recalibrate();
  res.json(weights);
});

module.exports = router;
