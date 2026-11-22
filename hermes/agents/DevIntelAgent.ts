/**
 * DevIntelAgent — Monitors the developer ecosystem for strategic advantage.
 *
 * Tracks: GitHub trending repos, emerging tools, tech stack shifts,
 * deprecations, security vulnerabilities, and paradigm shifts.
 *
 * Helps you know what to learn, what to build with, and what's dying —
 * before it becomes consensus.
 */

import axios from "axios";
import { config } from "../../shared/config";
import type {
  DevIntelSignal,
  DevSignalType,
  HermesContext,
} from "../shared/hermes-types";

interface GitHubRepo {
  name: string;
  full_name: string;
  description: string;
  stargazers_count: number;
  forks_count: number;
  language: string;
  topics: string[];
  created_at: string;
  pushed_at: string;
  html_url: string;
}

// Tech categories to track — each with search queries and growth thresholds
const TECH_VERTICALS = [
  {
    name: "ai-agents",
    queries: ["ai agent framework", "llm agent", "autonomous agent"],
    keywords: ["agent", "crew", "autogen", "langchain", "langgraph", "swarm"],
  },
  {
    name: "ai-infra",
    queries: ["llm inference", "vector database", "model serving"],
    keywords: ["vllm", "ollama", "gguf", "rag", "embedding", "vector"],
  },
  {
    name: "web-frameworks",
    queries: ["web framework 2026", "fullstack framework"],
    keywords: ["next.js", "nuxt", "svelte", "astro", "remix", "htmx", "solid"],
  },
  {
    name: "crypto-dev",
    queries: ["solidity framework", "smart contract tool"],
    keywords: ["foundry", "hardhat", "anchor", "solana", "ethereum", "defi"],
  },
  {
    name: "dev-tools",
    queries: ["developer tool trending", "cli tool developer"],
    keywords: ["cursor", "copilot", "claude", "codex", "terminal", "editor"],
  },
  {
    name: "systems",
    queries: ["rust systems programming", "infrastructure tool"],
    keywords: ["rust", "zig", "bun", "deno", "turbo", "wasm"],
  },
];

export class DevIntelAgent {
  readonly name = "DevIntelAgent";

  async gather(_ctx: HermesContext): Promise<DevIntelSignal[]> {
    console.log(`[${this.name}] Scanning developer ecosystem...`);

    const signals: DevIntelSignal[] = [];

    for (const vertical of TECH_VERTICALS) {
      const repos = await this.searchGitHub(vertical.queries[0]);
      const verticalSignals = this.analyzeVertical(vertical, repos);
      signals.push(...verticalSignals);
    }

    console.log(`[${this.name}] Found ${signals.length} dev intel signals`);
    return signals;
  }

  private async searchGitHub(query: string): Promise<GitHubRepo[]> {
    try {
      // GitHub search API — works without auth but with rate limits
      const { data } = await axios.get("https://api.github.com/search/repositories", {
        params: {
          q: `${query} stars:>500 pushed:>${this.daysAgo(30)}`,
          sort: "stars",
          order: "desc",
          per_page: 10,
        },
        headers: {
          Accept: "application/vnd.github.v3+json",
          ...(config.hermes.githubToken ? { Authorization: `token ${config.hermes.githubToken}` } : {}),
        },
        timeout: 15_000,
      });

      return (data.items ?? []) as GitHubRepo[];
    } catch (err) {
      console.warn(`[${this.name}] GitHub search failed for "${query}":`, err);
      return [];
    }
  }

  private analyzeVertical(
    vertical: { name: string; queries: string[]; keywords: string[] },
    repos: GitHubRepo[]
  ): DevIntelSignal[] {
    const signals: DevIntelSignal[] = [];

    for (const repo of repos) {
      const devType = this.classifyRepo(repo);
      const adoptionStage = this.assessAdoption(repo);
      const relevance = this.assessRelevance(repo, vertical.keywords);

      if (relevance < 0.3) continue; // skip low-relevance repos

      signals.push({
        id: `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        domain: "dev-intel",
        title: `${devType === "trending-repo" ? "Trending" : devType === "tool-emergence" ? "Emerging Tool" : "Notable"}: ${repo.full_name}`,
        summary: `${repo.description || repo.name}. ${repo.stargazers_count.toLocaleString()} stars, ${repo.language || "multi-lang"}. ${adoptionStage} stage.`,
        direction: adoptionStage === "emerging" || adoptionStage === "growing" ? "opportunity" : adoptionStage === "declining" ? "threat" : "shift",
        threatLevel: adoptionStage === "emerging" ? "medium" : "low",
        confidence: relevance,
        source: "GitHub",
        sourceUrl: repo.html_url,
        affectedSectors: [vertical.name, repo.language?.toLowerCase() ?? "general"].filter(Boolean),
        timestamp: Date.now(),
        tags: [vertical.name, repo.language?.toLowerCase() ?? "unknown", ...repo.topics.slice(0, 3)],
        devType,
        technology: repo.full_name,
        githubStars: repo.stargazers_count,
        weeklyGrowthPercent: this.estimateGrowth(repo),
        adoptionStage,
      });
    }

    return signals;
  }

  private classifyRepo(repo: GitHubRepo): DevSignalType {
    const daysSinceCreation = (Date.now() - new Date(repo.created_at).getTime()) / (1000 * 60 * 60 * 24);
    const starsPerDay = repo.stargazers_count / Math.max(daysSinceCreation, 1);

    if (starsPerDay > 50) return "trending-repo";
    if (daysSinceCreation < 180 && repo.stargazers_count > 1000) return "tool-emergence";
    if (daysSinceCreation < 90) return "paradigm-shift";
    return "stack-shift";
  }

  private assessAdoption(repo: GitHubRepo): DevIntelSignal["adoptionStage"] {
    const stars = repo.stargazers_count;
    const daysSinceUpdate = (Date.now() - new Date(repo.pushed_at).getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate > 180) return "declining";
    if (stars > 50_000) return "mainstream";
    if (stars > 5_000) return "growing";
    return "emerging";
  }

  private assessRelevance(repo: GitHubRepo, keywords: string[]): number {
    const text = `${repo.name} ${repo.description} ${repo.topics.join(" ")}`.toLowerCase();
    const matches = keywords.filter((kw) => text.includes(kw.toLowerCase())).length;
    return Math.min(matches / Math.max(keywords.length * 0.3, 1), 1);
  }

  private estimateGrowth(repo: GitHubRepo): number {
    // Rough estimate: stars / weeks since creation
    const weeks = Math.max((Date.now() - new Date(repo.created_at).getTime()) / (1000 * 60 * 60 * 24 * 7), 1);
    return (repo.stargazers_count / weeks) * 0.5; // conservative estimate of weekly growth
  }

  private daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split("T")[0];
  }

  fallback(): DevIntelSignal[] {
    return [];
  }
}
