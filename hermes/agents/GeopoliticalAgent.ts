/**
 * GeopoliticalAgent — Monitors geopolitical events that move markets and reshape industries.
 *
 * Tracks: sanctions, trade policy, energy policy, central bank moves,
 * regulatory shifts, elections, tariffs, technology bans.
 *
 * Source chain (graceful degradation at every tier):
 *  1. WorldMonitor  — structured, pre-scored, geolocated events (free, no key)
 *  2. GDELT DOC 2.0 — translingual headlines, 65 languages (free, no key)
 *  3. NewsAPI       — English business headlines (needs NEWSAPI_KEY)
 *  4. empty         — pipeline continues on fallback
 */

import axios from "axios";
import { config } from "../../shared/config";
import { fetchWorldEvents, WorldEvent } from "../sources/worldmonitor";
import { fetchGdeltArticles } from "../sources/gdelt";
import type {
  GeopoliticalSignal,
  GeoEventType,
  HermesContext,
  ThreatLevel,
} from "../shared/hermes-types";

// WorldMonitor category → GeoEventType (checked before keyword classification)
const CATEGORY_MAP: Array<[RegExp, GeoEventType]> = [
  [/sanction|embargo/, "sanctions"],
  [/conflict|military|war|defen[cs]e|troop/, "military"],
  [/central.?bank|monetary|fed|rate/, "central-bank"],
  [/tariff|duty/, "tariff"],
  [/trade|chokepoint|shipping|maritime/, "trade-policy"],
  [/energy|oil|gas|opec|pipeline/, "energy-policy"],
  [/election|vote|political/, "election"],
  [/regulat|compliance|antitrust/, "regulation"],
  [/treaty|accord|diplomat/, "treaty"],
  [/tech|chip|semiconductor|export.?control|cyber/, "technology-ban"],
];

const GDELT_GEO_QUERY =
  '(sanctions OR tariff OR "central bank" OR "federal reserve" OR "export controls" OR treaty OR embargo OR "trade war") sourcelang:english';

// Keyword sets for classifying raw headlines
const EVENT_KEYWORDS: Record<GeoEventType, string[]> = {
  sanctions: ["sanction", "embargo", "blacklist", "ofac", "restrict"],
  "trade-policy": ["tariff", "trade war", "trade deal", "import duty", "export ban", "trade agreement"],
  "energy-policy": ["opec", "oil", "natural gas", "lng", "pipeline", "energy bill", "carbon tax", "renewable mandate"],
  regulation: ["regulate", "compliance", "sec ", "finra", "regulation", "antitrust", "ftc", "doj"],
  election: ["election", "vote", "poll", "primary", "inaugurat", "parliament"],
  "central-bank": ["fed ", "federal reserve", "ecb", "boj", "rate hike", "rate cut", "interest rate", "quantitative", "fomc", "monetary policy"],
  military: ["military", "defense", "nato", "war ", "conflict", "deploy", "missile"],
  treaty: ["treaty", "agreement", "accord", "pact", "bilateral"],
  tariff: ["tariff", "duty", "levy", "import tax"],
  "technology-ban": ["chip ban", "export control", "tech ban", "semiconductor restrict", "huawei", "tiktok ban"],
};

const SECTOR_MAP: Record<GeoEventType, string[]> = {
  sanctions: ["finance", "energy", "defense", "technology"],
  "trade-policy": ["manufacturing", "agriculture", "technology", "retail"],
  "energy-policy": ["energy", "utilities", "transportation", "commodities"],
  regulation: ["finance", "technology", "healthcare", "crypto"],
  election: ["all-sectors"],
  "central-bank": ["finance", "real-estate", "bonds", "equities", "crypto"],
  military: ["defense", "energy", "commodities", "aerospace"],
  treaty: ["trade", "diplomacy", "finance"],
  tariff: ["manufacturing", "retail", "agriculture", "automotive"],
  "technology-ban": ["semiconductors", "ai", "technology", "telecom"],
};

export class GeopoliticalAgent {
  readonly name = "GeopoliticalAgent";

  async gather(_ctx: HermesContext): Promise<GeopoliticalSignal[]> {
    console.log(`[${this.name}] Scanning geopolitical signals...`);

    // Tier 1: WorldMonitor — structured events with pre-computed
    // geolocation, dedup, and escalation scoring
    const events = await fetchWorldEvents();
    if (events.length > 0) {
      const signals = events
        .map((e) => this.mapWorldEvent(e))
        .filter((s): s is GeopoliticalSignal => s !== null);
      if (signals.length > 0) {
        console.log(`[${this.name}] ${signals.length} signals from WorldMonitor`);
        return signals;
      }
    }

    // Tier 2/3: headline sources (GDELT → NewsAPI) + keyword classification
    const headlines = await this.fetchHeadlines();
    const signals: GeopoliticalSignal[] = [];

    for (const headline of headlines) {
      const classified = this.classify(headline);
      if (classified) {
        signals.push(classified);
      }
    }

    console.log(`[${this.name}] Found ${signals.length} geopolitical signals`);
    return signals;
  }

  /**
   * WorldMonitor events arrive geolocated, deduplicated, and escalation-scored,
   * so this mapping trusts upstream values over the keyword heuristics.
   */
  private mapWorldEvent(event: WorldEvent): GeopoliticalSignal | null {
    const text = `${event.category} ${event.title} ${event.summary}`.toLowerCase();

    let eventType: GeoEventType | null = null;
    for (const [pattern, type] of CATEGORY_MAP) {
      if (pattern.test(text)) {
        eventType = type;
        break;
      }
    }
    if (!eventType) return null;

    const score = event.escalationScore;
    const threatLevel: ThreatLevel =
      score >= 0.8 ? "critical" : score >= 0.6 ? "high" : score >= 0.35 ? "medium" : "low";

    return {
      id: `geo-wm-${event.id}`,
      domain: "geopolitical",
      title: event.title,
      summary: event.summary,
      direction: score >= 0.5 ? "threat" : this.assessDirection(text),
      threatLevel,
      // corroborated "breaking" events require 5 independent origin types
      confidence: event.corroborated ? 0.85 : Math.min(0.55 + score * 0.3, 0.8),
      source: event.provider,
      sourceUrl: event.url,
      affectedSectors: SECTOR_MAP[eventType] ?? [],
      timestamp: event.timestamp,
      tags: [eventType, ...(SECTOR_MAP[eventType]?.slice(0, 3) ?? [])],
      eventType,
      countries: event.countries.length > 0 ? event.countries : this.extractCountries(text),
      impactHorizon: score >= 0.6 ? "immediate" : this.assessHorizon(eventType),
    };
  }

  private async fetchHeadlines(): Promise<Array<{ title: string; description: string; source: string; url: string; publishedAt: string }>> {
    // Tier 2: GDELT — translingual, no key needed
    const gdeltArticles = await fetchGdeltArticles(GDELT_GEO_QUERY, "24h", 50);
    if (gdeltArticles.length > 0) {
      console.log(`[${this.name}] ${gdeltArticles.length} headlines from GDELT`);
      return gdeltArticles.map((a) => ({
        title: a.title,
        description: "",
        source: a.domain || "GDELT",
        url: a.url,
        publishedAt: new Date(a.seenAt).toISOString(),
      }));
    }

    // Tier 3: NewsAPI (needs key)
    const apiKey = config.hermes.newsApiKey;
    if (!apiKey) {
      console.warn(`[${this.name}] No NEWSAPI_KEY — using fallback scan`);
      return this.fallbackHeadlines();
    }

    try {
      const { data } = await axios.get("https://newsapi.org/v2/top-headlines", {
        params: {
          category: "business",
          language: "en",
          pageSize: 50,
          apiKey,
        },
        timeout: 15_000,
      });

      return (data.articles ?? []).map((a: any) => ({
        title: a.title ?? "",
        description: a.description ?? "",
        source: a.source?.name ?? "unknown",
        url: a.url ?? "",
        publishedAt: a.publishedAt ?? new Date().toISOString(),
      }));
    } catch (err) {
      console.error(`[${this.name}] NewsAPI fetch failed:`, err);
      return this.fallbackHeadlines();
    }
  }

  private fallbackHeadlines() {
    // When no API key is configured, return empty.
    // In production, wire to RSS feeds, government press releases, etc.
    return [];
  }

  private classify(headline: { title: string; description: string; source: string; url: string; publishedAt: string }): GeopoliticalSignal | null {
    const text = `${headline.title} ${headline.description}`.toLowerCase();

    let matchedType: GeoEventType | null = null;
    let maxMatches = 0;

    for (const [eventType, keywords] of Object.entries(EVENT_KEYWORDS) as [GeoEventType, string[]][]) {
      const matches = keywords.filter((kw) => text.includes(kw)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        matchedType = eventType;
      }
    }

    if (!matchedType || maxMatches === 0) return null;

    const threatLevel = this.assessThreat(text, matchedType);
    const direction = this.assessDirection(text);

    return {
      id: `geo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      domain: "geopolitical",
      title: headline.title,
      summary: headline.description || headline.title,
      direction,
      threatLevel,
      confidence: Math.min(0.5 + maxMatches * 0.15, 0.95),
      source: headline.source,
      sourceUrl: headline.url,
      affectedSectors: SECTOR_MAP[matchedType] ?? [],
      timestamp: new Date(headline.publishedAt).getTime() || Date.now(),
      tags: [matchedType, ...SECTOR_MAP[matchedType]?.slice(0, 3) ?? []],
      eventType: matchedType,
      countries: this.extractCountries(text),
      impactHorizon: this.assessHorizon(matchedType),
    };
  }

  private assessThreat(text: string, eventType: GeoEventType): ThreatLevel {
    const urgentWords = ["emergency", "crisis", "crash", "collapse", "war", "invasion", "default"];
    const highWords = ["ban", "sanction", "restrict", "halt", "suspend"];

    if (urgentWords.some((w) => text.includes(w))) return "critical";
    if (highWords.some((w) => text.includes(w))) return "high";
    if (eventType === "central-bank" || eventType === "sanctions") return "high";
    if (eventType === "election" || eventType === "treaty") return "medium";
    return "low";
  }

  private assessDirection(text: string): "opportunity" | "threat" | "shift" | "neutral" {
    const threatWords = ["crash", "ban", "restrict", "war", "crisis", "default", "collapse"];
    const oppWords = ["deal", "agreement", "cut", "stimulus", "ease", "approve", "lift"];
    const shiftWords = ["shift", "transition", "reform", "pivot", "change"];

    if (threatWords.some((w) => text.includes(w))) return "threat";
    if (oppWords.some((w) => text.includes(w))) return "opportunity";
    if (shiftWords.some((w) => text.includes(w))) return "shift";
    return "neutral";
  }

  private extractCountries(text: string): string[] {
    const countries: Record<string, string> = {
      "united states": "US", "u.s.": "US", "america": "US",
      china: "CN", chinese: "CN", beijing: "CN",
      russia: "RU", russian: "RU", moscow: "RU",
      europe: "EU", european: "EU", eu: "EU",
      japan: "JP", japanese: "JP", "bank of japan": "JP",
      india: "IN", "south korea": "KR", "saudi": "SA",
      iran: "IR", uk: "GB", britain: "GB", germany: "DE",
      france: "FR", brazil: "BR", mexico: "MX", canada: "CA",
    };

    const found = new Set<string>();
    for (const [keyword, code] of Object.entries(countries)) {
      if (text.includes(keyword)) found.add(code);
    }
    return Array.from(found);
  }

  private assessHorizon(eventType: GeoEventType): "immediate" | "weeks" | "months" | "years" {
    switch (eventType) {
      case "central-bank":
      case "sanctions":
      case "military":
        return "immediate";
      case "tariff":
      case "trade-policy":
      case "technology-ban":
        return "weeks";
      case "regulation":
      case "energy-policy":
      case "election":
        return "months";
      case "treaty":
        return "years";
      default:
        return "months";
    }
  }

  fallback(): GeopoliticalSignal[] {
    return [];
  }
}
