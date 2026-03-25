const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const telegram = require('./telegram');

const agentsRouter = require('./routes/agents');
const postsRouter = require('./routes/posts');
const platformsRouter = require('./routes/platforms');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/agents', agentsRouter);
app.use('/api/posts', postsRouter);
app.use('/api/platforms', platformsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    telegram: telegram.enabled,
    timestamp: new Date().toISOString(),
  });
});

// Start Telegram bot
telegram.init();

app.listen(PORT, () => {
  console.log(`Nexus API running on http://localhost:${PORT}`);
});
