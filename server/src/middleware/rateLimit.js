const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 30;

const hits = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!hits.has(ip)) {
    hits.set(ip, []);
  }

  const timestamps = hits.get(ip).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  hits.set(ip, timestamps);

  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - timestamps.length));

  if (timestamps.length > MAX_REQUESTS) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
  }

  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of hits) {
    const valid = timestamps.filter((t) => now - t < WINDOW_MS);
    if (valid.length === 0) hits.delete(ip);
    else hits.set(ip, valid);
  }
}, WINDOW_MS);

module.exports = rateLimit;
