const HubAgent = require('./HubAgent');
const ContentAgent = require('./ContentAgent');
const MarketAgent = require('./MarketAgent');
const PredictionAgent = require('./PredictionAgent');

const hub = new HubAgent();
const content = new ContentAgent();
const market = new MarketAgent();
const prediction = new PredictionAgent();

const agents = { hub, content, market, prediction };

module.exports = agents;
