const HubAgent = require('./HubAgent');
const ContentAgent = require('./ContentAgent');
const MarketAgent = require('./MarketAgent');
const PredictionAgent = require('./PredictionAgent');
const SEOAgent = require('./SEOAgent');

const hub = new HubAgent();
const content = new ContentAgent();
const market = new MarketAgent();
const prediction = new PredictionAgent();
const seo = new SEOAgent();

const agents = { hub, content, market, prediction, seo };

module.exports = agents;
