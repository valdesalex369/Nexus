/**
 * IndustryRadar — Tracks macro shifts across energy, AI, economics, biotech, defense.
 *
 * Identifies which industries are consolidating, disrupting, or emerging.
 * Maps power shifts, capital flows, and talent migration.
 */

import axios from "axios";
import type {
  IndustrySignal,
  IndustryShiftType,
  HermesContext,
} from "../shared/hermes-types";

interface IndustryScan {
  sector: string;
  subsectors: string[];
  watchKeywords: string[];
  competitors: string[];
}

const TRACKED_INDUSTRIES: IndustryScan[] = [
  {
    sector: "artificial-intelligence",
    subsectors: ["llm", "agents", "robotics", "computer-vision", "mlops"],
    watchKeywords: ["openai", "anthropic", "google deepmind", "meta ai", "mistral", "llama", "gpt", "claude", "gemini", "transformer", "diffusion"],
    competitors: ["OpenAI", "Google", "Meta", "Anthropic", "Mistral", "xAI"],
  },
  {
    sector: "energy",
    subsectors: ["solar", "nuclear", "battery", "hydrogen", "oil-gas", "grid"],
    watchKeywords: ["solar", "nuclear", "fusion", "battery", "lithium", "hydrogen", "renewable", "grid", "opec", "shale", "lng"],
    competitors: ["Tesla Energy", "NextEra", "EDF", "CATL", "BYD"],
  },
  {
    sector: "semiconductors",
    subsectors: ["gpu", "cpu", "memory", "foundry", "packaging"],
    watchKeywords: ["nvidia", "tsmc", "asml", "intel", "amd", "samsung", "chip", "semiconductor", "fab", "wafer", "nanometer"],
    competitors: ["NVIDIA", "TSMC", "ASML", "Intel", "AMD", "Samsung"],
  },
  {
    sector: "crypto-defi",
    subsectors: ["l1", "l2", "defi", "rwa", "stablecoin", "infrastructure"],
    watchKeywords: ["ethereum", "solana", "bitcoin", "defi", "rwa", "stablecoin", "tokenization", "layer 2", "rollup"],
    competitors: ["Coinbase", "Circle", "Tether", "Binance", "BlackRock Digital"],
  },
  {
    sector: "defense-aerospace",
    subsectors: ["drones", "cyber", "space", "missiles", "ai-defense"],
    watchKeywords: ["defense", "pentagon", "lockheed", "raytheon", "drone", "satellite", "spacex", "hypersonic", "cyber warfare"],
    competitors: ["Lockheed Martin", "Palantir", "Anduril", "SpaceX", "Northrop Grumman"],
  },
  {
    sector: "biotech-health",
    subsectors: ["gene-therapy", "longevity", "diagnostics", "neurotech", "pharma"],
    watchKeywords: ["crispr", "gene therapy", "longevity", "neuralink", "mrna", "biotech", "fda approv", "clinical trial"],
    competitors: ["Moderna", "CRISPR Therapeutics", "Neuralink", "Illumina"],
  },
];

export class IndustryRadar {
  readonly name = "IndustryRadar";

  async gather(_ctx: HermesContext): Promise<IndustrySignal[]> {
    console.log(`[${this.name}] Scanning industry shifts...`);

    const headlines = await this.fetchIndustryNews();
    const signals: IndustrySignal[] = [];

    for (const industry of TRACKED_INDUSTRIES) {
      const relevantHeadlines = headlines.filter((h) => {
        const text = `${h.title} ${h.description}`.toLowerCase();
        return industry.watchKeywords.some((kw) => text.includes(kw));
      });

      if (relevantHeadlines.length > 0) {
        const classified = this.classifyIndustryShift(industry, relevantHeadlines);
        signals.push(...classified);
      }
    }

    console.log(`[${this.name}] Found ${signals.length} industry signals`);
    return signals;
  }

  private async fetchIndustryNews(): Promise<Array<{ title: string; description: string; source: string; url: string }>> {
    const apiKey = process.env.NEWSAPI_KEY;
    if (!apiKey) {
      console.warn(`[${this.name}] No NEWSAPI_KEY — skipping live industry scan`);
      return [];
    }

    try {
      const queries = ["artificial intelligence", "energy transition", "semiconductor", "defense technology"];
      const allArticles: Array<{ title: string; description: string; source: string; url: string }> = [];

      for (const q of queries) {
        try {
          const { data } = await axios.get("https://newsapi.org/v2/everything", {
            params: { q, language: "en", pageSize: 10, sortBy: "publishedAt", apiKey },
            timeout: 10_000,
          });
          for (const a of data.articles ?? []) {
            allArticles.push({
              title: a.title ?? "",
              description: a.description ?? "",
              source: a.source?.name ?? "unknown",
              url: a.url ?? "",
            });
          }
        } catch {
          // Continue with other queries if one fails
        }
      }

      return allArticles;
    } catch (err) {
      console.error(`[${this.name}] News fetch failed:`, err);
      return [];
    }
  }

  private classifyIndustryShift(
    industry: IndustryScan,
    headlines: Array<{ title: string; description: string; source: string; url: string }>
  ): IndustrySignal[] {
    const signals: IndustrySignal[] = [];
    const allText = headlines.map((h) => `${h.title} ${h.description}`).join(" ").toLowerCase();

    const shiftType = this.detectShiftType(allText);
    const momentum = this.detectMomentum(allText);
    const competitorMoves = this.detectCompetitorMoves(allText, industry.competitors);

    // Only emit a signal if we detected a meaningful shift
    if (shiftType) {
      const topHeadline = headlines[0];
      signals.push({
        id: `ind-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        domain: "industry",
        title: `${industry.sector}: ${shiftType} detected`,
        summary: `${headlines.length} signals in ${industry.sector}. Top: "${topHeadline.title}". ${competitorMoves.length > 0 ? `Competitor moves: ${competitorMoves.join(", ")}` : ""}`,
        direction: shiftType === "disruption" || shiftType === "emergence" ? "opportunity" : shiftType === "consolidation" ? "shift" : "neutral",
        threatLevel: shiftType === "disruption" ? "high" : "medium",
        confidence: Math.min(0.4 + headlines.length * 0.08, 0.9),
        source: topHeadline.source,
        sourceUrl: topHeadline.url,
        affectedSectors: [industry.sector, ...industry.subsectors.slice(0, 3)],
        timestamp: Date.now(),
        tags: [industry.sector, shiftType, ...industry.subsectors.slice(0, 2)],
        shiftType,
        sector: industry.sector,
        subsector: industry.subsectors[0],
        momentum,
        competitorMoves,
      });
    }

    return signals;
  }

  private detectShiftType(text: string): IndustryShiftType | null {
    const patterns: [IndustryShiftType, string[]][] = [
      ["consolidation", ["merger", "acquire", "acquisition", "buyout", "consolidat"]],
      ["disruption", ["disrupt", "breakthrough", "revolutionary", "game-chang", "paradigm"]],
      ["emergence", ["launch", "debut", "introduce", "unveil", "first-ever", "pioneer"]],
      ["regulation-shift", ["regulat", "ban", "mandate", "compliance", "legislat"]],
      ["capital-flow", ["invest", "funding", "raise", "billion", "million", "ipo", "valuation"]],
      ["talent-migration", ["hire", "recruit", "talent", "engineer", "layoff", "restructur"]],
      ["supply-chain", ["supply chain", "shortage", "bottleneck", "onshore", "reshoring"]],
    ];

    let best: IndustryShiftType | null = null;
    let bestScore = 0;

    for (const [type, keywords] of patterns) {
      const score = keywords.filter((kw) => text.includes(kw)).length;
      if (score > bestScore) {
        bestScore = score;
        best = type;
      }
    }

    return bestScore > 0 ? best : null;
  }

  private detectMomentum(text: string): "accelerating" | "steady" | "decelerating" {
    const accelWords = ["surge", "soar", "boom", "accelerat", "record", "all-time high", "skyrocket"];
    const decelWords = ["slow", "decline", "stall", "plateau", "downturn", "slump", "contract"];

    const accel = accelWords.filter((w) => text.includes(w)).length;
    const decel = decelWords.filter((w) => text.includes(w)).length;

    if (accel > decel) return "accelerating";
    if (decel > accel) return "decelerating";
    return "steady";
  }

  private detectCompetitorMoves(text: string, competitors: string[]): string[] {
    return competitors.filter((c) => text.toLowerCase().includes(c.toLowerCase()));
  }

  fallback(): IndustrySignal[] {
    return [];
  }
}
