export type AlphaDecision = 'NO_ACTION' | 'WATCH' | 'PAPER_LONG' | 'PAPER_SHORT';
export type AlphaStatus = 'OPEN' | 'RESOLVED' | 'INVALIDATED';

export interface AlphaEvidenceRef {
  uri: string;
  title?: string;
  observedAt?: string;
  sourceType: 'primary' | 'official' | 'filing' | 'market' | 'alternative-data' | 'secondary' | 'internal';
}

export interface AlphaContribution {
  id: string;
  role: string;
  weight?: number;
  note?: string;
}

export interface AlphaPrediction {
  id: string;
  createdAt: string;
  horizonEnd: string;
  thesis: string;
  target: string;
  probability: number;
  baselineProbability?: number;
  decision: AlphaDecision;
  paperNotionalUsd?: number;
  evidence: AlphaEvidenceRef[];
  contradictingEvidence: AlphaEvidenceRef[];
  falsifier: string;
  sourceContributions: AlphaContribution[];
  modelContributions: AlphaContribution[];
  status: AlphaStatus;
}

export interface AlphaResolution {
  resolvedAt: string;
  outcome: boolean;
  note: string;
  brierScore: number;
  paperReturnPct?: number;
  paperPnlUsd?: number;
}

export interface ResolvedAlphaPrediction extends AlphaPrediction {
  status: 'RESOLVED';
  resolution: AlphaResolution;
}

export interface AlphaCalibrationSummary {
  count: number;
  meanBrierScore: number | null;
  meanPredictedProbability: number | null;
  observedOutcomeRate: number | null;
  calibrationGap: number | null;
  highConfidenceCount: number;
  highConfidenceHitRate: number | null;
  paperPnlUsd: number;
}

function isValidIso(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function validateAlphaPrediction(prediction: AlphaPrediction): string[] {
  const errors: string[] = [];
  if (!prediction.id.trim()) errors.push('id is required');
  if (!prediction.thesis.trim()) errors.push('thesis is required');
  if (!prediction.target.trim()) errors.push('target is required');
  if (!Number.isFinite(prediction.probability) || prediction.probability < 0 || prediction.probability > 1) {
    errors.push('probability must be in [0,1]');
  }
  if (
    prediction.baselineProbability !== undefined &&
    (!Number.isFinite(prediction.baselineProbability) || prediction.baselineProbability < 0 || prediction.baselineProbability > 1)
  ) {
    errors.push('baselineProbability must be in [0,1]');
  }
  if (!isValidIso(prediction.createdAt)) errors.push('createdAt must be a valid ISO timestamp');
  if (!isValidIso(prediction.horizonEnd)) errors.push('horizonEnd must be a valid ISO timestamp');
  if (isValidIso(prediction.createdAt) && isValidIso(prediction.horizonEnd) && Date.parse(prediction.horizonEnd) <= Date.parse(prediction.createdAt)) {
    errors.push('horizonEnd must be later than createdAt');
  }
  if (prediction.evidence.length === 0) errors.push('at least one evidence reference is required');
  if (!prediction.falsifier.trim()) errors.push('falsifier is required');
  if (prediction.paperNotionalUsd !== undefined && (!Number.isFinite(prediction.paperNotionalUsd) || prediction.paperNotionalUsd < 0)) {
    errors.push('paperNotionalUsd must be non-negative');
  }
  if (prediction.status !== 'OPEN') errors.push('new predictions must start OPEN');
  return errors;
}

export function resolveAlphaPrediction(
  prediction: AlphaPrediction,
  outcome: boolean,
  resolvedAt: string,
  note: string,
  paperReturnPct?: number,
): ResolvedAlphaPrediction {
  const errors = validateAlphaPrediction(prediction);
  if (errors.length > 0) throw new Error(`Invalid alpha prediction: ${errors.join('; ')}`);
  if (!isValidIso(resolvedAt)) throw new Error('resolvedAt must be a valid ISO timestamp');
  const resolvedAtMs = Date.parse(resolvedAt);
  if (resolvedAtMs < Date.parse(prediction.createdAt)) throw new Error('resolvedAt cannot be earlier than createdAt');

  const realized = outcome ? 1 : 0;
  const brierScore = (prediction.probability - realized) ** 2;
  let paperPnlUsd: number | undefined;
  if (paperReturnPct !== undefined && prediction.paperNotionalUsd !== undefined) {
    paperPnlUsd = prediction.paperNotionalUsd * (paperReturnPct / 100);
  }

  return {
    ...prediction,
    status: 'RESOLVED',
    resolution: {
      resolvedAt,
      outcome,
      note,
      brierScore,
      paperReturnPct,
      paperPnlUsd,
    },
  };
}

export function summarizeAlphaCalibration(records: ResolvedAlphaPrediction[]): AlphaCalibrationSummary {
  if (records.length === 0) {
    return {
      count: 0,
      meanBrierScore: null,
      meanPredictedProbability: null,
      observedOutcomeRate: null,
      calibrationGap: null,
      highConfidenceCount: 0,
      highConfidenceHitRate: null,
      paperPnlUsd: 0,
    };
  }

  const count = records.length;
  const meanBrierScore = records.reduce((sum, record) => sum + record.resolution.brierScore, 0) / count;
  const meanPredictedProbability = records.reduce((sum, record) => sum + record.probability, 0) / count;
  const observedOutcomeRate = records.reduce((sum, record) => sum + (record.resolution.outcome ? 1 : 0), 0) / count;
  const calibrationGap = Math.abs(meanPredictedProbability - observedOutcomeRate);
  const highConfidence = records.filter((record) => record.probability >= 0.7 || record.probability <= 0.3);
  const highConfidenceHits = highConfidence.filter((record) => {
    const predictedTrue = record.probability >= 0.5;
    return predictedTrue === record.resolution.outcome;
  }).length;
  const paperPnlUsd = records.reduce((sum, record) => sum + (record.resolution.paperPnlUsd ?? 0), 0);

  return {
    count,
    meanBrierScore,
    meanPredictedProbability,
    observedOutcomeRate,
    calibrationGap,
    highConfidenceCount: highConfidence.length,
    highConfidenceHitRate: highConfidence.length > 0 ? highConfidenceHits / highConfidence.length : null,
    paperPnlUsd,
  };
}
