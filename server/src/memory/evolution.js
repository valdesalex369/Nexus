const fs = require('fs');
const path = require('path');

const OUTCOMES_PATH = path.resolve(__dirname, '../../data/outcomes.json');
const WEIGHTS_PATH = path.resolve(__dirname, '../../data/weights.json');

const DEFAULT_WEIGHTS = {
  mirofish: 0.35,
  market: 0.30,
  onchain: 0.25,
  macro: 0.10,
};

class Evolution {
  constructor() {
    this.outcomes = this._load(OUTCOMES_PATH, []);
    this.weights = this._load(WEIGHTS_PATH, { ...DEFAULT_WEIGHTS });
  }

  _load(filePath, fallback) {
    try {
      if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { /* ignore */ }
    return fallback;
  }

  _save(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  recordOutcome(prediction, actual, sources) {
    const outcome = {
      id: Date.now(),
      prediction,
      actual,
      correct: prediction.direction === actual.direction,
      sources,
      confidence: prediction.confidence || 0,
      timestamp: new Date().toISOString(),
    };

    this.outcomes.push(outcome);
    this._save(OUTCOMES_PATH, this.outcomes);

    if (this.outcomes.length >= 10 && this.outcomes.length % 5 === 0) {
      this.recalibrate();
    }

    return outcome;
  }

  recalibrate() {
    const recent = this.outcomes.slice(-50);
    if (recent.length < 10) return this.weights;

    const sourceAccuracy = { mirofish: [], market: [], onchain: [], macro: [] };

    for (const o of recent) {
      if (!o.sources) continue;
      for (const [source, signal] of Object.entries(o.sources)) {
        if (sourceAccuracy[source] !== undefined) {
          const correct = signal.direction === o.actual.direction ? 1 : 0;
          sourceAccuracy[source].push(correct);
        }
      }
    }

    const newWeights = {};
    let total = 0;
    for (const [source, results] of Object.entries(sourceAccuracy)) {
      if (results.length === 0) {
        newWeights[source] = this.weights[source] || DEFAULT_WEIGHTS[source];
      } else {
        newWeights[source] = results.reduce((a, b) => a + b, 0) / results.length;
      }
      total += newWeights[source];
    }

    for (const key of Object.keys(newWeights)) {
      newWeights[key] = Math.round((newWeights[key] / total) * 100) / 100;
    }

    this.weights = newWeights;
    this._save(WEIGHTS_PATH, this.weights);

    console.log('[Evolution] Recalibrated weights:', this.weights);
    return this.weights;
  }

  getWeights() {
    return { ...this.weights };
  }

  getStats() {
    const total = this.outcomes.length;
    const correct = this.outcomes.filter((o) => o.correct).length;
    return {
      totalOutcomes: total,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      weights: this.getWeights(),
      lastRecalibration: this.outcomes.length >= 10 ? 'active' : `need ${10 - total} more outcomes`,
    };
  }
}

const evolution = new Evolution();
module.exports = evolution;
