const BaseAgent = require('./BaseAgent');

const WATCHED_WALLETS = [
  { label: 'Binance Hot', address: '0x28C6c06298d514Db089934071355E5743bf21d60' },
  { label: 'Coinbase', address: '0x71660c4005BA85c37ccec55d0C4493E66Fe775d3' },
  { label: 'Jump Trading', address: '0xf584F8728B874a6a5c7A8d4d387C9aae9172D621' },
  { label: 'Wintermute', address: '0x0000000000000000000000000000000000000000' },
];

class OnChainAgent extends BaseAgent {
  constructor() {
    super(
      'OnChainAgent',
      'onchain-analyst',
      `You are OnChainAgent, an on-chain data analyst for crypto markets.
You monitor whale wallets, exchange flows, and on-chain metrics.
When given wallet data or transaction logs, analyze for significant movements.
Flag movements over $1M. Use the fetch_url tool to query Etherscan when needed.
Return JSON: { "movements": [...], "alerts": [...], "summary": "..." }`
    );
  }

  async scanWallets() {
    const etherscanKey = process.env.ETHERSCAN_API_KEY;
    if (!etherscanKey || etherscanKey.includes('your_')) {
      return this.run(
        `No Etherscan API key configured. Analyze the known whale wallets conceptually:\n${JSON.stringify(WATCHED_WALLETS, null, 2)}\n\nProvide a template analysis showing what to watch for.`
      );
    }

    const walletSummary = WATCHED_WALLETS.map((w) => `${w.label}: ${w.address}`).join('\n');
    return this.run(
      `Scan these whale wallets for recent activity. Use the fetch_url tool to query Etherscan API (key: ${etherscanKey}).\n\nWallets:\n${walletSummary}\n\nEtherscan endpoint: https://api.etherscan.io/api?module=account&action=txlist&address=ADDRESS&startblock=0&endblock=99999999&sort=desc&apikey=${etherscanKey}\n\nAnalyze the last 5 transactions from each wallet. Flag anything over $1M.`
    );
  }

  async detectWhaleMovement(address) {
    return this.run(
      `Analyze wallet ${address} for whale movement patterns. Use fetch_url to get recent transactions if Etherscan key is available.`
    );
  }
}

module.exports = OnChainAgent;
