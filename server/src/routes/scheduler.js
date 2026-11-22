const { Router } = require('express');
const { runCycle, startScheduler, stopScheduler, getSchedulerStatus, getCycles } = require('../scheduler/cron');
const agents = require('../agents');
const telegram = require('../telegram');
const evolution = require('../memory/evolution');

const router = Router();

router.get('/status', (req, res) => {
  res.json(getSchedulerStatus());
});

router.get('/cycles', (req, res) => {
  res.json(getCycles(parseInt(req.query.limit) || 10));
});

router.post('/start', (req, res) => {
  const intervalMs = (parseInt(req.body.intervalMinutes) || 60) * 60 * 1000;
  startScheduler(agents, telegram, evolution, intervalMs);
  res.json({ started: true, intervalMinutes: intervalMs / 60000 });
});

router.post('/stop', (req, res) => {
  stopScheduler();
  res.json({ stopped: true });
});

router.post('/cycle', async (req, res) => {
  try {
    const result = await runCycle(agents, telegram, evolution);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
