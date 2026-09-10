function apiKeyAuth(req, res, next) {
  const key = process.env.NEXUS_API_KEY;

  if (!key || key === 'your_nexus_api_key_here') {
    return next();
  }

  const provided = req.headers['x-api-key'] || req.query.apiKey;

  if (!provided || provided !== key) {
    return res.status(401).json({ error: 'Invalid or missing API key. Pass via x-api-key header.' });
  }

  next();
}

module.exports = apiKeyAuth;
