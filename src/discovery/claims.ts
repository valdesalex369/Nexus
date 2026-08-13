/**
 * CLAIM EXTRACTION, RANKING, DEDUPLICATION, CROSS-CHECK
 *
 * Everything here is deterministic. No model is consulted, and that is a feature
 * rather than a limitation: a claim computed from a structured provider field
 * ("this repository reports 1,234 stars") has provenance by construction and
 * cannot be invented. Models may propose claims later, but they enter through
 * `validateClaim` like everything else.
 */
import { createHash, randomUUID } from 'node:crypto';
import type {
  Claim, Contradiction, SearchResult, Source, SourceKind,
} from './types.ts';

/** Evidence older than this is flagged stale; the caller decides what to do. */
export const STALE_AFTER_DAYS = 540;

// ---------------------------------------------------------------------------
// Source ranking
// ---------------------------------------------------------------------------

/**
 * Reliability from observable signals only. No model opinion enters this number.
 * Signals are returned alongside so the score can be argued with.
 */
export function rankSource(
  result: SearchResult, kind: SourceKind, now = Date.now(),
): { reliability: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0.35; // an unknown source starts below the midpoint, not at it

  const s = result.signals ?? {};

  // Adoption: a thing many people depend on is more likely to be real.
  const adoption = s.stars ?? s.downloads ?? s.recentDownloads ?? s.popularity ?? 0;
  if (adoption > 0) {
    // log-scaled: 10 -> small bump, 10k -> large, 1M -> capped
    const bump = Math.min(0.3, Math.log10(adoption + 1) / 20);
    score += bump;
    signals.push(`adoption=${Math.round(adoption)} (+${bump.toFixed(2)})`);
  } else {
    signals.push('adoption=0 or unreported');
  }

  // Recency: an abandoned project is weaker evidence about the present.
  const ageDays = Number.isFinite(s.ageDays)
    ? s.ageDays!
    : result.publishedAt ? (now - Date.parse(result.publishedAt)) / 86_400_000 : Number.NaN;
  if (Number.isFinite(ageDays)) {
    if (ageDays < 90) { score += 0.15; signals.push(`updated ${Math.round(ageDays)}d ago (+0.15)`); }
    else if (ageDays < 365) { score += 0.05; signals.push(`updated ${Math.round(ageDays)}d ago (+0.05)`); }
    else if (ageDays > STALE_AFTER_DAYS) {
      score -= 0.15; signals.push(`STALE: ${Math.round(ageDays)}d old (-0.15)`);
    }
  } else {
    signals.push('no date reported');
  }

  // Provider-native quality scores, where the provider computes one.
  if (typeof s.quality === 'number' && s.quality > 0) {
    score += s.quality * 0.1;
    signals.push(`registry quality=${s.quality.toFixed(2)}`);
  }

  // Substance: an empty description is a weak signal of a real project.
  if (!result.snippet || result.snippet.startsWith('(no description')) {
    score -= 0.08;
    signals.push('no description (-0.08)');
  }

  // A named author is marginally more accountable than an anonymous one.
  if (result.author) { score += 0.03; signals.push(`author=${result.author}`); }

  // Kind priors: a package registry reports facts; a video reports opinion.
  const prior: Partial<Record<SourceKind, number>> = {
    'package-registry': 0.05, github: 0.05, docs: 0.05, paper: 0.05,
    youtube: -0.1, community: -0.05, news: -0.03,
  };
  const p = prior[kind] ?? 0;
  if (p !== 0) { score += p; signals.push(`kind prior ${kind} (${p > 0 ? '+' : ''}${p})`); }

  return { reliability: Math.max(0, Math.min(1, score)), signals };
}

export function isStale(source: Source, now = Date.now()): boolean {
  if (!source.publishedAt) return false;
  const t = Date.parse(source.publishedAt);
  return Number.isFinite(t) && (now - t) / 86_400_000 > STALE_AFTER_DAYS;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/** Strip the parts of a URL that vary without changing identity. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    u.protocol = 'https:';
    u.hostname = u.hostname.replace(/^www\./, '').toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, '').toLowerCase();
    return u.toString();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Collapse results that are the same thing. Two results are duplicates when
 * their canonical URLs match, or when title and snippet both match after
 * normalisation — the common case of one project surfacing on two registries.
 */
export function dedupe(results: SearchResult[]): { kept: SearchResult[]; removed: number } {
  const seen = new Set<string>();
  const kept: SearchResult[] = [];
  for (const r of results) {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const keys = [canonicalUrl(r.url), `t:${norm(r.title)}|${norm(r.snippet)}`];
    if (keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    kept.push(r);
  }
  return { kept, removed: results.length - kept.length };
}

// ---------------------------------------------------------------------------
// Claim extraction
// ---------------------------------------------------------------------------

const claimId = (subject: string, predicate: string) =>
  `clm_${createHash('sha256').update(`${subject}|${predicate}`).digest('hex').slice(0, 16)}`;

/**
 * Turn a retrieved result into OBSERVED claims, using only fields the provider
 * actually returned. Every claim carries the source id, so provenance exists by
 * construction rather than by promise.
 */
export function extractClaims(source: Source, result: SearchResult): Claim[] {
  const now = new Date().toISOString();
  const claims: Claim[] = [];
  const subject = result.title;

  const push = (predicate: string, value: string | number, text: string) => {
    claims.push({
      id: claimId(subject, predicate),
      text,
      classification: 'OBSERVED',
      subject,
      predicate,
      value,
      provenance: [source.id],
      // An observation is only as good as the source it came from.
      confidence: source.reliability,
      createdAt: now,
    });
  };

  if (result.snippet && !result.snippet.startsWith('(no description')) {
    push('describes-itself-as', result.snippet,
      `${subject} describes itself as: ${result.snippet}`);
  }
  for (const [k, v] of Object.entries(result.signals ?? {})) {
    if (!Number.isFinite(v)) continue;
    push(k, v, `${subject} reports ${k} = ${Math.round(v).toLocaleString()}`);
  }
  if (result.publishedAt) {
    push('published-at', result.publishedAt, `${subject} was published/created ${result.publishedAt}`);
  }
  return claims;
}

/**
 * A count over observed claims — the archetypal INFERRED claim. Cites every
 * claim it was derived from, so the inference can be walked back to sources.
 */
export function inferPrevalence(
  claims: Claim[], predicate: string, description: string,
): Claim | null {
  const relevant = claims.filter((c) => c.predicate === predicate && c.classification === 'OBSERVED');
  if (relevant.length === 0) return null;
  const subjects = new Set(relevant.map((c) => c.subject));
  return {
    id: `inf_${randomUUID().slice(0, 12)}`,
    text: `${subjects.size} distinct retrieved items report ${predicate} — ${description}`,
    classification: 'INFERRED',
    predicate: `prevalence:${predicate}`,
    value: subjects.size,
    provenance: relevant.map((c) => c.id),
    // An inference is capped below its weakest input; it cannot exceed its evidence.
    confidence: Math.min(0.8, Math.min(...relevant.map((c) => c.confidence))),
    createdAt: new Date().toISOString(),
  };
}

/** Explicitly record what we looked for and could not determine. */
export function unknownClaim(question: string): Claim {
  return {
    id: `unk_${createHash('sha256').update(question).digest('hex').slice(0, 12)}`,
    text: `UNKNOWN: ${question}`,
    classification: 'UNKNOWN',
    provenance: [],
    confidence: 0,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Cross-check / contradiction detection
// ---------------------------------------------------------------------------

const NUMERIC_TOLERANCE = 0.05; // 5% — registries disagree slightly and legitimately

/**
 * Find claims that cannot both be true. Works on the structured form, so it
 * detects real conflicts (two sources reporting different values for the same
 * metric) rather than superficial wording differences.
 */
export function detectContradictions(
  claims: Claim[],
  /**
   * Which provider a source id came from. Within one provider a name identifies
   * one entity; across providers it does not — `small` on npm and `small` on
   * crates.io are different things. Without this lookup every cross-registry
   * name collision is misreported as a factual disagreement.
   */
  providerOf?: (sourceId: string) => string | undefined,
): Contradiction[] {
  const out: Contradiction[] = [];
  const byKey = new Map<string, Claim[]>();

  for (const c of claims) {
    if (!c.subject || !c.predicate || c.value === undefined) continue;
    if (c.classification !== 'OBSERVED') continue;
    const key = `${c.subject.toLowerCase()}|${c.predicate.toLowerCase()}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(c);
  }

  for (const group of byKey.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!, b = group[j]!;
        // Same source reporting the same fact twice is not a contradiction.
        if (a.provenance.join() === b.provenance.join()) continue;

        // Establish whether these two claims are even about the same entity.
        const pa = providerOf?.(a.provenance[0] ?? '');
        const pb = providerOf?.(b.provenance[0] ?? '');
        const sameEntity = !pa || !pb || pa === pb;

        if (!sameEntity) {
          out.push({
            claimA: a.id, claimB: b.id, kind: 'identity-ambiguity',
            reason: `'${a.subject}' appears on both ${pa} and ${pb} — probably two different `
              + 'things sharing a name, not a disagreement',
            severity: 0.1,
          });
          continue;
        }

        if (typeof a.value === 'number' && typeof b.value === 'number') {
          const max = Math.max(Math.abs(a.value), Math.abs(b.value), 1);
          const delta = Math.abs(a.value - b.value) / max;
          if (delta > NUMERIC_TOLERANCE) {
            out.push({
              claimA: a.id, claimB: b.id, kind: 'value-conflict',
              reason: `${a.subject} ${a.predicate}: ${a.value} vs ${b.value} `
                + `(${(delta * 100).toFixed(0)}% apart)`,
              severity: Math.min(1, delta),
            });
          }
        } else if (String(a.value).trim() !== String(b.value).trim()) {
          out.push({
            claimA: a.id, claimB: b.id, kind: 'value-conflict',
            reason: `${a.subject} ${a.predicate}: conflicting values reported by different sources`,
            severity: 0.5,
          });
        }
      }
    }
  }
  return out;
}

/**
 * A claim confirmed by independent sources is stronger than one seen once.
 * Corroboration raises confidence; it never raises it to certainty.
 */
export function crossCheck(claims: Claim[]): Map<string, number> {
  const support = new Map<string, Set<string>>();
  for (const c of claims) {
    if (c.classification !== 'OBSERVED' || !c.subject || !c.predicate) continue;
    const key = `${c.subject.toLowerCase()}|${c.predicate.toLowerCase()}|${String(c.value).trim()}`;
    for (const p of c.provenance) {
      (support.get(key) ?? support.set(key, new Set()).get(key)!).add(p);
    }
  }
  const boosted = new Map<string, number>();
  for (const c of claims) {
    if (c.classification !== 'OBSERVED' || !c.subject || !c.predicate) continue;
    const key = `${c.subject.toLowerCase()}|${c.predicate.toLowerCase()}|${String(c.value).trim()}`;
    const n = support.get(key)?.size ?? 1;
    boosted.set(c.id, n > 1 ? Math.min(0.95, c.confidence + 0.1 * Math.log2(n)) : c.confidence);
  }
  return boosted;
}
