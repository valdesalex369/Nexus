const HubAgent = require('./HubAgent');
const ContentAgent = require('./ContentAgent');
const MarketAgent = require('./MarketAgent');
const PredictionAgent = require('./PredictionAgent');
const SEOAgent = require('./SEOAgent');
const MiroFishAgent = require('./MiroFishAgent');
const OnChainAgent = require('./OnChainAgent');

const hub = new HubAgent();
const content = new ContentAgent();
const market = new MarketAgent();
const prediction = new PredictionAgent();
const seo = new SEOAgent();
const mirofish = new MiroFishAgent();
const onchain = new OnChainAgent();

const agents = { hub, content, market, prediction, seo, mirofish, onchain };

module.exports = agents;
