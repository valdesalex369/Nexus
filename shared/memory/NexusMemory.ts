/**
 * NexusMemory — Persistent learned-weight storage and prediction history.
 *
 * Stores prediction weights, win/loss records, and learned insights.
 * Persists to a local JSON file so state survives restarts.
 */

import fs from "fs";
import path from "path";
import type { NexusMemoryState, PredictionOutput } from "../types";

const MEMORY_FILE = path.resolve(__dirname, "../../data/nexus-memory.json");
const MAX_RECENT_PREDICTIONS = 200;

function defaultState(): NexusMemoryState {
  return {
    predictionWeights: {
      market: 0.25,
      onchain: 0.20,
      mirofish: 0.25,
      feargreed: 0.15,
      competitor: 0.15,
    },
    recentPredictions: [],
    winRate: 0,
    totalCycles: 0,
    lastRecalibration: 0,
    learnedInsights: [],
  };
}

export class NexusMemory {
  private state: NexusMemoryState;

  constructor() {
    this.state = this.load();
  }

  // --- Persistence ---

  private load(): NexusMemoryState {
    try {
      if (fs.existsSync(MEMORY_FILE)) {
        const raw = fs.readFileSync(MEMORY_FILE, "utf-8");
        return JSON.parse(raw) as NexusMemoryState;
      }
    } catch (err) {
      console.warn("[NexusMemory] Failed to load, using defaults:", err);
    }
    return defaultState();
  }

  save(): void {
    const dir = path.dirname(MEMORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.state, null, 2));
  }

  // --- Getters ---

  getState(): NexusMemoryState {
    return { ...this.state };
  }

  getWeights(): Record<string, number> {
    return { ...this.state.predictionWeights };
  }

  getWeight(source: string): number {
    return this.state.predictionWeights[source] ?? 0;
  }

  getWinRate(): number {
    return this.state.winRate;
  }

  // --- Mutations ---

  recordPrediction(prediction: PredictionOutput): void {
    this.state.recentPredictions.unshift(prediction);
    if (this.state.recentPredictions.length > MAX_RECENT_PREDICTIONS) {
      this.state.recentPredictions = this.state.recentPredictions.slice(
        0,
        MAX_RECENT_PREDICTIONS
      );
    }
    this.state.totalCycles++;
    this.save();
  }

  updateWeights(newWeights: Record<string, number>): void {
    // Normalize so weights sum to 1
    const total = Object.values(newWeights).reduce((s, w) => s + w, 0);
    for (const [key, value] of Object.entries(newWeights)) {
      this.state.predictionWeights[key] = total > 0 ? value / total : 0;
    }
    this.state.lastRecalibration = Date.now();
    this.save();
  }

  updateWinRate(winRate: number): void {
    this.state.winRate = winRate;
    this.save();
  }

  addInsight(insight: string): void {
    this.state.learnedInsights.push(insight);
    // Keep last 100 insights
    if (this.state.learnedInsights.length > 100) {
      this.state.learnedInsights = this.state.learnedInsights.slice(-100);
    }
    this.save();
  }

  reset(): void {
    this.state = defaultState();
    this.save();
  }
}
