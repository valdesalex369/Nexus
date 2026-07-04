/**
 * SmartMoneyAgent — Tracks institutional flows, whale movements, and VC funding.
 *
 * "Follow the money to find where conviction is concentrating."
 *
 * Monitors: whale wallet accumulation/distribution, VC funding rounds,
 * insider transactions, institutional filings, treasury moves.
 */

import axios from "axios";
import { config } from "../../shared/config";
import type {
  SmartMoneySignal,
  FlowType,
  HermesContext,
} from "../shared/hermes-types";

// Well-known whale addresses to track (public, not private keys)
const WATCHED_WHALES = [
  { label: "Binance Hot Wallet", address: "0x28C6c06298d514Db089934071355E5743bf21d60" },
  { label: "Coinbase Prime", address: "0xA9D1e08C7793af67e9d92fe308d5697FB81d3E43" },
  { label: "Jump Trading", address: "0xf584f8728b874a6a5c7a8d4d387c9aae9172d621" },
];

// Minimum ETH value to consider a transaction "whale-grade"
const WHALE_MIN_ETH = 500;

export class SmartMoneyAgent {
  readonly name = "SmartMoneyAgent";

  async gather(_ctx: HermesContext): Promise<SmartMoneySignal[]> {
    console.log(`[${this.name}] Tracking smart money flows...`);

    const signals: SmartMoneySignal[] = [];

    const [whaleSignals, vcSignals] = await Promise.allSettled([
      this.trackWhaleWallets(),
      this.scanVCFunding(),
    ]);

    if (whaleSignals.status === "fulfilled") signals.push(...whaleSignals.value);
    if (vcSignals.status === "fulfilled") signals.push(...vcSignals.value);

    console.log(`[${this.name}] Found ${signals.length} smart money signals`);
    return signals;
  }

  private async trackWhaleWallets(): Promise<SmartMoneySignal[]> {
    if (!config.etherscan.apiKey) {
      console.warn(`[${this.name}] No ETHERSCAN_API_KEY — skipping whale tracking`);
      return [];
    }

    const signals: SmartMoneySignal[] = [];

    for (const whale of WATCHED_WHALES) {
      try {
        const { data } = await axios.get("https://api.etherscan.io/api", {
          params: {
            module: "account",
            action: "txlist",
            address: whale.address,
            startblock: 0,
            endblock: 99999999,
            page: 1,
            offset: 10,
            sort: "desc",
            apikey: config.etherscan.apiKey,
          },
          timeout: 10_000,
        });

        if (data.status !== "1" || !Array.isArray(data.result)) continue;

        for (const tx of data.result) {
          const ethValue = parseFloat(tx.value) / 1e18;
          if (ethValue < WHALE_MIN_ETH) continue;

          const isOutflow = tx.from.toLowerCase() === whale.address.toLowerCase();
          const flowType: FlowType = isOutflow ? "whale-distribution" : "whale-accumulation";
          const ethPrice = 3500; // approximate — in production, fetch live
          const usdValue = ethValue * ethPrice;

          signals.push({
            id: `sm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            domain: "smart-money",
            title: `${whale.label}: ${isOutflow ? "Distribution" : "Accumulation"} ${ethValue.toFixed(0)} ETH`,
            summary: `${whale.label} ${isOutflow ? "sent" : "received"} ${ethValue.toFixed(2)} ETH (~$${(usdValue / 1e6).toFixed(2)}M). ${isOutflow ? "Possible selling pressure or treasury rebalancing." : "Accumulation signal — conviction buying."}`,
            direction: isOutflow ? "threat" : "opportunity",
            threatLevel: usdValue > 10_000_000 ? "high" : usdValue > 1_000_000 ? "medium" : "low",
            confidence: 0.7,
            source: "Etherscan",
            sourceUrl: `https://etherscan.io/tx/${tx.hash}`,
            affectedSectors: ["crypto", "ethereum", "defi"],
            timestamp: parseInt(tx.timeStamp) * 1000,
            tags: ["whale", flowType, "ethereum"],
            flowType,
            entity: whale.label,
            asset: "ETH",
            amountUsd: usdValue,
            isContrarian: false,
          });
        }
      } catch (err) {
        console.warn(`[${this.name}] Failed to track ${whale.label}:`, err);
      }
    }

    return signals;
  }

  private async scanVCFunding(): Promise<SmartMoneySignal[]> {
    // VC funding data typically comes from Crunchbase, PitchBook, or news APIs.
    // Using news-based detection as a lightweight alternative.
    const apiKey = process.env.NEWSAPI_KEY;
    if (!apiKey) return [];

    try {
      const { data } = await axios.get("https://newsapi.org/v2/everything", {
        params: {
          q: "funding round raised million series",
          language: "en",
          pageSize: 15,
          sortBy: "publishedAt",
          apiKey,
        },
        timeout: 10_000,
      });

      const signals: SmartMoneySignal[] = [];

      for (const article of data.articles ?? []) {
        const text = `${article.title} ${article.description}`.toLowerCase();
        const funding = this.extractFunding(text);
        if (!funding) continue;

        signals.push({
          id: `sm-vc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          domain: "smart-money",
          title: `VC Funding: ${article.title}`,
          summary: article.description || article.title,
          direction: "opportunity",
          threatLevel: funding.amount > 100_000_000 ? "high" : funding.amount > 10_000_000 ? "medium" : "low",
          confidence: 0.6,
          source: article.source?.name ?? "news",
          sourceUrl: article.url,
          affectedSectors: this.inferSectors(text),
          timestamp: new Date(article.publishedAt).getTime(),
          tags: ["vc-funding", funding.round, ...this.inferSectors(text).slice(0, 2)],
          flowType: "vc-funding",
          entity: undefined,
          asset: funding.round,
          amountUsd: funding.amount,
          isContrarian: false,
        });
      }

      return signals;
    } catch (err) {
      console.error(`[${this.name}] VC scan failed:`, err);
      return [];
    }
  }

  private extractFunding(text: string): { amount: number; round: string } | null {
    // Extract dollar amounts: "$50 million", "$1.2 billion"
    const millionMatch = text.match(/\$(\d+(?:\.\d+)?)\s*(?:m|million)/i);
    const billionMatch = text.match(/\$(\d+(?:\.\d+)?)\s*(?:b|billion)/i);

    let amount = 0;
    if (billionMatch) amount = parseFloat(billionMatch[1]) * 1_000_000_000;
    else if (millionMatch) amount = parseFloat(millionMatch[1]) * 1_000_000;
    else return null;

    // Detect round
    let round = "unknown";
    if (text.includes("seed")) round = "seed";
    else if (text.includes("series a")) round = "series-a";
    else if (text.includes("series b")) round = "series-b";
    else if (text.includes("series c")) round = "series-c";
    else if (text.includes("series d")) round = "series-d";
    else if (text.includes("ipo")) round = "ipo";

    return { amount, round };
  }

  private inferSectors(text: string): string[] {
    const sectorKeywords: Record<string, string[]> = {
      ai: ["artificial intelligence", "machine learning", "llm", "ai "],
      crypto: ["crypto", "blockchain", "web3", "defi", "bitcoin", "ethereum"],
      fintech: ["fintech", "payments", "banking", "lending"],
      biotech: ["biotech", "pharma", "gene", "clinical"],
      energy: ["energy", "solar", "battery", "nuclear", "clean"],
      defense: ["defense", "cyber", "security"],
      saas: ["saas", "cloud", "enterprise"],
    };

    const found: string[] = [];
    for (const [sector, keywords] of Object.entries(sectorKeywords)) {
      if (keywords.some((kw) => text.includes(kw))) found.push(sector);
    }
    return found.length > 0 ? found : ["general"];
  }

  fallback(): SmartMoneySignal[] {
    return [];
  }
}
