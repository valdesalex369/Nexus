const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '../../data/logs');

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const entry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
      ip: req.ip || req.connection.remoteAddress,
    };

    const line = JSON.stringify(entry);
    console.log(`[${entry.method}] ${entry.path} ${entry.status} (${entry.duration}ms)`);

    ensureLogDir();
    const logFile = path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    fs.appendFileSync(logFile, line + '\n');
  });

  next();
}

module.exports = requestLogger;
