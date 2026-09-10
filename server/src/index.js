const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const telegram = require('./telegram');
const memory = require('./memory/zettel');
const evolution = require('./memory/evolution');
const apiKeyAuth = require('./middleware/auth');
const rateLimit = require('./middleware/rateLimit');
const requestLogger = require('./middleware/logger');

const agentsRouter = require('./routes/agents');
const postsRouter = require('./routes/posts');
const platformsRouter = require('./routes/platforms');
const seoRouter = require('./routes/seo');
const memoryRouter = require('./routes/memory');
const schedulerRouter = require('./routes/scheduler');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(requestLogger);
app.use(rateLimit);
app.use(apiKeyAuth);

app.use('/api/agents', agentsRouter);
app.use('/api/posts', postsRouter);
app.use('/api/platforms', platformsRouter);
app.use('/api/seo', seoRouter);
app.use('/api/memory', memoryRouter);
app.use('/api/scheduler', schedulerRouter);

app.post('/api/cycle', async (req, res) => {
  const { runCycle } = require('./scheduler/cron');
  const agents = require('./agents');
  try {
    const result = await runCycle(agents, telegram, evolution);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  const { getSchedulerStatus } = require('./scheduler/cron');
  res.json({
    status: 'ok',
    telegram: telegram.enabled,
    pendingApprovals: telegram.pendingApprovals.size,
    memory: memory.stats(),
    evolution: evolution.getStats(),
    scheduler: getSchedulerStatus(),
    timestamp: new Date().toISOString(),
  });
});

telegram.init();

app.listen(PORT, async () => {
  console.log(`Nexus API running on http://localhost:${PORT}`);
  console.log(`[Nexus] ${Object.keys(require('./agents')).length} agents loaded`);
  console.log(`[Nexus] ${memory.notes.size} memory notes loaded`);

  const sent = await telegram.sendStartupTest();
  if (sent) {
    console.log('[Nexus] Telegram conductor active');
  }
});
