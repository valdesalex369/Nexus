/**
 * DISCOVERY — the evidence model.
 *
 * The whole engine exists to keep one distinction alive end to end:
 *
 *     what we OBSERVED   vs.   what we INFERRED   vs.   what we GUESSED
 *
 * A claim that cannot name a source it came from is not evidence, and the
 * system refuses to store it as one. That refusal is the product.
 */

export type SourceKind =
  | 'web' | 'github' | 'youtube' | 'docs' | 'paper' | 'market'
  | 'community' | 'jobs' | 'reviews' | 'competitor' | 'dataset' | 'news'
  | 'file' | 'conversation' | 'package-registry';

/** How a claim relates to reality. Never collapse these. */
export type ClaimClass =
  /** Directly present in a source we retrieved and hashed. */
  | 'OBSERVED'
  /** Derived by reasoning over observed claims. Must cite what it was derived from. */
  | 'INFERRED'
  /** A proposal to be tested. Carries no evidentiary weight. */
  | 'HYPOTHESIS'
  /** We looked and could not determine this. Recorded so it is not silently dropped. */
  | 'UNKNOWN';

/** Where an artifact sits in the evidence hierarchy. Nothing skips a stage. */
export type EvidenceStage =
  'RAW' | 'PARSED' | 'CLASSIFIED' | 'INDEXED' | 'CLAIMED' | 'VERIFIED';

export interface Source {
  id: string;
  kind: SourceKind;
  provider: string;
  url?: string;
  path?: string;
  title?: string;
  author?: string;
  /** When we fetched it. Always known. */
  retrievedAt: string;
  /** When the source itself was published, when the provider tells us. */
  publishedAt?: string;
  /** SHA-256 of the raw payload. Makes "we saw this" checkable later. */
  sha256: string;
  /** 0..1 — computed by rankSource(), never asserted by a model. */
  reliability: number;
  /** Signals that fed the reliability score, so it can be disputed. */
  reliabilitySignals: string[];
  /** Injection/credential flags found in the payload. */
  flags: string[];
}

export interface Claim {
  id: string;
  text: string;
  classification: ClaimClass;
  /**
   * Structured form, when the claim has one. Present on claims extracted from
   * structured provider fields. Contradiction detection works on these rather
   * than on prose, so "1,234 stars" vs "89 stars" is caught as a conflict while
   * two differently-worded but compatible sentences are not.
   */
  subject?: string;
  predicate?: string;
  value?: string | number;
  /**
   * Source ids for OBSERVED claims; claim ids for INFERRED claims.
   * Enforced by `validateClaim` — an OBSERVED claim with no source is rejected.
   */
  provenance: string[];
  /** 0..1. For OBSERVED this reflects source reliability, not model certainty. */
  confidence: number;
  /** Set when a later claim supersedes this one. */
  supersededBy?: string;
  createdAt: string;
}

export interface Contradiction {
  claimA: string;
  claimB: string;
  reason: string;
  /** Higher means the two claims are more directly opposed. */
  severity: number;
  /**
   * `value-conflict`  — the same entity is reported with different values.
   * `identity-ambiguity` — two DIFFERENT entities share a name across sources
   *   (e.g. a package called "small" on both npm and crates.io). This is not a
   *   disagreement about a fact, and treating it as one manufactures conflict.
   */
  kind: 'value-conflict' | 'identity-ambiguity';
}

/** One result from a provider, before it becomes a Source. */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  author?: string;
  publishedAt?: string;
  /** Provider-native signals used for ranking (stars, downloads, votes). */
  signals?: Record<string, number>;
  /** The raw payload this result was extracted from. Preserved, never discarded. */
  raw: unknown;
}

export type ProviderStatus =
  | { state: 'live' }
  | { state: 'unwired'; reason: string };

export interface SearchOptions {
  limit?: number;
  timeoutMs?: number;
}

/**
 * A source adapter. Providers do exactly one thing: turn a query into results,
 * or fail honestly. They never interpret, never score, never summarise.
 */
export interface SourceProvider {
  readonly name: string;
  readonly kind: SourceKind;
  status(): ProviderStatus;
  search(query: string, opts?: SearchOptions): Promise<SearchResult[]>;
}

/** Recorded when a provider could not be reached. Never silently swallowed. */
export interface SourceUnavailable {
  provider: string;
  query: string;
  reason: string;
  at: string;
}

export class ProvenanceError extends Error {
  constructor(message: string) { super(message); this.name = 'ProvenanceError'; }
}

/**
 * Reject claims that cannot support themselves.
 *
 * This is the single most important guard in the engine: it is what stops a
 * model from asserting a fact and having the system file it as evidence.
 */
export function validateClaim(c: Claim, knownSourceIds: Set<string>, knownClaimIds: Set<string>): void {
  if (!c.text?.trim()) throw new ProvenanceError(`claim ${c.id}: empty text`);

  if (c.classification === 'OBSERVED') {
    if (c.provenance.length === 0) {
      throw new ProvenanceError(
        `claim ${c.id} is OBSERVED but cites no source — an unsourced observation is not evidence`);
    }
    for (const p of c.provenance) {
      if (!knownSourceIds.has(p)) {
        throw new ProvenanceError(
          `claim ${c.id} cites source '${p}' which was never retrieved — hallucinated provenance`);
      }
    }
  }

  if (c.classification === 'INFERRED') {
    if (c.provenance.length === 0) {
      throw new ProvenanceError(
        `claim ${c.id} is INFERRED but cites nothing it was inferred from`);
    }
    for (const p of c.provenance) {
      if (!knownClaimIds.has(p) && !knownSourceIds.has(p)) {
        throw new ProvenanceError(
          `claim ${c.id} was inferred from '${p}', which does not exist`);
      }
    }
  }

  // HYPOTHESIS and UNKNOWN may stand alone — but they carry no evidentiary
  // weight, and confidence is capped so nothing downstream can treat them as fact.
  if ((c.classification === 'HYPOTHESIS' || c.classification === 'UNKNOWN') && c.confidence > 0.5) {
    throw new ProvenanceError(
      `claim ${c.id} is ${c.classification} but claims confidence ${c.confidence} — `
      + 'unverified claims may not exceed 0.5');
  }

  if (c.confidence < 0 || c.confidence > 1) {
    throw new ProvenanceError(`claim ${c.id}: confidence ${c.confidence} out of range`);
  }
}
