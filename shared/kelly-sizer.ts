/**
 * Kelly Criterion position sizer.
 *
 * Given a predicted probability and the market odds, computes the optimal
 * fraction of bankroll to risk. Capped at config.kellyMaxPercent for safety.
 */

import { config } from "./config";

export interface KellyInput {
  /** Your estimated probability of winning (0-1) */
  winProbability: number;
  /** The odds being offered (decimal, e.g. 2.0 for even money) */
  odds: number;
}

export interface KellyOutput {
  /** Raw Kelly fraction (can be negative = don't bet) */
  rawFraction: number;
  /** Capped fraction applied to bankroll (0 to kellyMaxPercent/100) */
  cappedFraction: number;
  /** As a percentage of bankroll */
  sizePercent: number;
  /** Whether the edge is sufficient to place a bet */
  shouldBet: boolean;
}

/**
 * Full Kelly: f* = (bp - q) / b
 * where b = decimal odds - 1, p = win probability, q = 1 - p
 *
 * We use half-Kelly for extra conservatism (divide by 2).
 */
export function kellySize(input: KellyInput): KellyOutput {
  const { winProbability: p, odds } = input;
  const q = 1 - p;
  const b = odds - 1;

  const rawFraction = b > 0 ? (b * p - q) / b : 0;
  const halfKelly = rawFraction / 2; // half-Kelly for safety

  const maxFraction = config.kellyMaxPercent / 100;
  const cappedFraction = Math.max(0, Math.min(halfKelly, maxFraction));
  const sizePercent = cappedFraction * 100;

  return {
    rawFraction,
    cappedFraction,
    sizePercent,
    shouldBet: cappedFraction > 0,
  };
}

/**
 * Convenience: compute Kelly from a predicted probability and market price.
 * Market price is the cost of a "yes" contract (0-1).
 */
export function kellyFromPrediction(
  predictedProb: number,
  marketPrice: number
): KellyOutput {
  // If we buy "yes" at marketPrice and it pays $1:
  // odds = 1 / marketPrice  (decimal)
  // edge = predictedProb - marketPrice
  if (marketPrice <= 0 || marketPrice >= 1) {
    return { rawFraction: 0, cappedFraction: 0, sizePercent: 0, shouldBet: false };
  }
  const odds = 1 / marketPrice;
  return kellySize({ winProbability: predictedProb, odds });
}
