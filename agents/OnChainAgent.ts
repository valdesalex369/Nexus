/**
 * OnChainAgent — Tracks whale transactions and wallet activity via Etherscan.
 */

import axios from "axios";
import { BaseAgent } from "./BaseAgent";
import { config } from "../shared/config";
import type { AgentContext, WhaleTransaction, WalletInfo } from "../shared/types";

const ETHERSCAN_API = "https://api.etherscan.io/api";
const WHALE_THRESHOLD_ETH = 100; // Only report txns >= 100 ETH

export class OnChainAgent extends BaseAgent {
  constructor() {
    super("OnChainAgent", "onchain");
  }

  protected async execute(ctx: AgentContext): Promise<{
    whaleTransactions: WhaleTransaction[];
    walletInfo: WalletInfo | null;
  }> {
    const [whaleTransactions, walletInfo] = await Promise.all([
      this.fetchWhaleTransactions(),
      this.fetchWalletInfo(),
    ]);
    return { whaleTransactions, walletInfo };
  }

  private async fetchWhaleTransactions(): Promise<WhaleTransaction[]> {
    if (!config.etherscan.apiKey) {
      console.warn("[OnChainAgent] No ETHERSCAN_API_KEY — skipping whale tracking");
      return [];
    }

    try {
      // Fetch recent large ETH transfers from a known whale list
      // Using internal transactions for high-value movements
      const { data } = await axios.get(ETHERSCAN_API, {
        params: {
          module: "account",
          action: "txlist",
          address: config.wallet.address || "0x0000000000000000000000000000000000000000",
          startblock: 0,
          endblock: 99999999,
          page: 1,
          offset: 20,
          sort: "desc",
          apikey: config.etherscan.apiKey,
        },
        timeout: 10_000,
      });

      if (data.status !== "1" || !Array.isArray(data.result)) return [];

      return data.result
        .filter((tx: any) => {
          const ethValue = parseFloat(tx.value) / 1e18;
          return ethValue >= WHALE_THRESHOLD_ETH;
        })
        .map((tx: any) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: (parseFloat(tx.value) / 1e18).toFixed(4),
          token: "ETH",
          timestamp: parseInt(tx.timeStamp) * 1000,
        }));
    } catch (err) {
      console.error("[OnChainAgent] fetchWhaleTransactions failed:", err);
      return [];
    }
  }

  private async fetchWalletInfo(): Promise<WalletInfo | null> {
    if (!config.etherscan.apiKey || !config.wallet.address) return null;

    try {
      const { data } = await axios.get(ETHERSCAN_API, {
        params: {
          module: "account",
          action: "balance",
          address: config.wallet.address,
          tag: "latest",
          apikey: config.etherscan.apiKey,
        },
        timeout: 10_000,
      });

      if (data.status !== "1") return null;

      return {
        address: config.wallet.address,
        balanceEth: parseFloat(data.result) / 1e18,
        recentTxCount: 0,
        lastActivity: Date.now(),
      };
    } catch {
      return null;
    }
  }

  override fallback() {
    return { whaleTransactions: [], walletInfo: null };
  }
}
