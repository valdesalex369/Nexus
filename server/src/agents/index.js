const HubAgent = require('./HubAgent');
const ContentAgent = require('./ContentAgent');
const MarketAgent = require('./MarketAgent');

const hub = new HubAgent();
const content = new ContentAgent();
const market = new MarketAgent();

const agents = { hub, content, market };

module.exports = agents;
